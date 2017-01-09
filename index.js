var path = require('path');
var fs = require('fs');
var postcss = require('postcss');
var _ = require('lodash');
var spritesmith = require('spritesmith').run;
var mkdirp = require('mkdirp');
var md5 = require('spark-md5').hash;
var gutil = require('gulp-util');
var Promise = require('bluebird');

var space = postcss.list.space;
Promise.promisifyAll(fs);

// @media rule for @2x resolutions
var resolutions2x = [
	'only screen and (-webkit-min-device-pixel-ratio: 2)',
	'only screen and (min--moz-device-pixel-ratio: 2)',
	'only screen and (-o-min-device-pixel-ratio: 2/1)',
	'only screen and (min-device-pixel-ratio: 2)',
	'only screen and (min-resolution: 2dppx)',
	'only screen and (min-resolution: 192dpi)'
];

// @media rule for @3x resolutions. currently only work in some mobile devices
var resolutions3x = [
	'only screen and (-webkit-min-device-pixel-ratio: 3)',
	'only screen and (min-resolution: 3dppx)'
];

var GROUP_DELIMITER = '.';
var GROUP_MASK = '*';

// cache objects
var cache = {};
var cacheIndex = {};

/* --------------------------------------------------------------
 # Main functions
 -------------------------------------------------------------- */
module.exports = postcss.plugin('postcss-lazysprite', function (options) {
	// default Options
	options = options || {};
	options.groupBy = options.groupBy || [];
	options.padding = options.padding ? options.padding : 10;

	// Namespace for CSS selectors
	options.nameSpace = options.nameSpace || '';

	// Other paths
	options.imagePath = path.resolve(process.cwd(), options.imagePath || '');
	options.spritePath = path.resolve(process.cwd(), options.spritePath || '');

	// Group retina images
	options.groupBy.unshift(function (image) {
		if (image.ratio > 1) {
			return '@' + image.ratio + 'x';
		}
		return null;
	});

	// Processer
	return function (css) {
		return extractImages(css, options)
			.spread(function (images, options) {
				return applyGroupBy(images, options);
			})
			.spread(function (images, options) {
				return setTokens(images, options, css);
			})
			.spread(function (images, options) {
				return runSpriteSmith(images, options);
			})
			.spread(function (images, options, sprites) {
				return saveSprites(images, options, sprites);
			})
			.spread(function (images, options, sprites) {
				return mapSpritesProperties(images, options, sprites);
			})
			.spread(function (images, options, sprites) {
				return updateReferences(images, options, sprites, css);
			});
	};
});

/**
 * Walks the @lazysprite atrule and get the value to extract the target images.
 * @param  {Node}   css
 * @param  {Object} options
 * @return {Promise}
 */
function extractImages(css, options) {
	var images = [];
	var stylesheetPath = options.stylesheetPath || path.dirname(css.source.input.file);

	if (!stylesheetPath) {
		log('Lazysprite:', gutil.colors.red('option `stylesheetPath` is undefined!'));
	}

	// Find @lazysprite string from css
	css.walkAtRules('lazysprite', function (atRule) {
		// Get the directory of images from atRule value
		var params = space(atRule.params);
		var sliceDir = getAtRuleValue(params);

		// Get absolute path of directory.
		var imageDir = path.resolve(options.imagePath, sliceDir);

		// Foreach the images and set image object.
		var files = fs.readdirSync(imageDir);
		files.forEach(function (filename) {
			// Have to be png file
			var reg = /\.(png|svg)\b/i;
			if (!reg.test(filename)) {
				return null;
			}

			var image = {
				path: null, // Absolute path
				name: null, // Filename
				stylesheetPath: stylesheetPath,
				ratio: 1,
				groups: [],
				token: ''
			};

			image.name = filename;

			// Set the directory name as sprite file name,
			// .pop() to get the last element in array
			image.dir = imageDir.split(path.sep).pop();
			image.groups = [image.dir];
			image.selector = image.dir + '__icon-' + image.name.split('.')[0];

			// For retina
			if (isRetinaImage(image.name)) {
				image.ratio = getRetinaRatio(image.name);
				image.selector = image.dir + '__icon-' + image.name.split('@')[0];
			}

			// Get absolute path of image
			image.path = path.resolve(imageDir, filename);
			images.push(image);
		});
	});
	return Promise.resolve([images, options]);
}

/**
 * Apply groupBy functions over collection of exported images.
 * @param  {Object} options
 * @param  {Array}  images
 * @return {Promise}
 */
function applyGroupBy(images, options) {
	return Promise.reduce(options.groupBy, function (images, group) {
		return Promise.map(images, function (image) {
			return Promise.resolve(group(image)).then(function (group) {
				if (group) {
					image.groups.push(group);
				}
				return image;
			}).catch(function (image) {
				return image;
			});
		});
	}, images).then(function (images) {
		return [images, options];
	});
}

/**
 * Set the necessary tokens info to the background declarations.
 * @param  {Node}   css
 * @param  {Object} options
 * @param  {Array}  images
 * @return {Promise}
 */
function setTokens(images, options, css) {
	return new Promise(function (resolve) {
		css.walkAtRules('lazysprite', function (atRule) {
			// Get the directory of images from atRule value
			var params = space(atRule.params);
			var sliceDir = getAtRuleValue(params);
			var sliceDirname = sliceDir.split(path.sep).pop();

			var atRuleParent = atRule.parent;
			var mediaAtRule2x = postcss.atRule({name: 'media', params: resolutions2x.join(', ')});
			var mediaAtRule3x = postcss.atRule({name: 'media', params: resolutions3x.join(', ')});

			// Tag flag
			var has2x = false;
			var has3x = false;

			// Foreach every image object
			_.forEach(images, function (image) {
				// Only work when equal to directory name
				if (sliceDirname === image.dir) {
					image.token = postcss.comment({
						text: image.path,
						raws: {
							before: ' ',
							// before: '\n    ', // Use this to control indent but no work well
							left: '@replace|',
							right: ''
						}
					});

					// add `source` argument for source map create.
					var singleRule = postcss.rule({
						selector: '.' + options.nameSpace + image.selector,
						source: atRule.source
					});

					singleRule.append(image.token);

					switch (image.ratio) {
					// @1x
					case 1:
						atRuleParent.append(singleRule);
						break;
					// @2x
					case 2:
						mediaAtRule2x.append(singleRule);
						has2x = true;
						break;
					// @3x
					case 3:
						mediaAtRule3x.append(singleRule);
						has3x = true;
						break;
					default:
						break;
					}
				}
			});

			// @2x @3x media rule are last.
			if (has2x) {
				atRuleParent.append(mediaAtRule2x);
			}
			if (has3x) {
				atRuleParent.append(mediaAtRule3x);
			}

			// Remove @lazysprite atRule.
			atRule.remove();
		});
		resolve([images, options]);
	});
}

/**
 * Use spritesmith module to process images.
 * @param  {Object} options
 * @param  {Array}  images
 * @return {Promise}
 */
function runSpriteSmith(images, options) {
	return new Promise(function (resolve, reject) {
		var all = _
			.chain(images)
			.groupBy(function (image) {
				var temp;

				temp = image.groups.map(mask(true));
				temp.unshift('_');

				return temp.join(GROUP_DELIMITER);
			})
			.map(function (images, temp) {
				var config = _.merge({}, options, {
					src: _.map(images, 'path')
				});
				var ratio;

				// Enlarge padding when are retina images
				if (areAllRetina(images)) {
					ratio = _
						.chain(images)
						.flatMap('ratio')
						.uniq()
						.value();

					if (ratio.length === 1) {
						config.padding *= ratio[0];
					}
				}

				var checkstring = [];

				// Collect images datechanged
				config.spriteName = temp.replace(/^_./, '').replace(/.@/, '@');
				_.each(config.src, function (image) {
					checkstring.push(md5(fs.readFileSync(image).toString()));
				});

				checkstring = md5(checkstring.join('&'));

				// Get data from cache (avoid spritesmith)
				if (cache[checkstring]) {
					var deferred = Promise.pending();
					var results = cache[checkstring];

					results.isFromCache = true;
					deferred.resolve(results);
					return deferred.promise;
				}

				return Promise.promisify(spritesmith)(config)
					.then(function (result) {
						temp = temp.split(GROUP_DELIMITER);
						temp.shift();

						// Append info about sprite group
						result.groups = temp.map(mask(false));

						// Cache - clean old
						var oldCheckstring = cacheIndex[config.spriteName];
						if (oldCheckstring && cache[oldCheckstring]) {
							delete cache[oldCheckstring];
						}

						// Cache - add brand new data
						cacheIndex[config.spriteName] = checkstring;
						cache[checkstring] = result;

						return result;
					});
			})
			.value();

		Promise.all(all)
			.then(function (results) {
				resolve([images, options, results]);
			})
			.catch(function (err) {
				if (err) {
					reject(err);
				}
			});
	});
}

/**
 * Save the sprites to the target path.
 * @param  {Object} options
 * @param  {Array}  images
 * @param  {Array}  sprites
 * @return {Promise}
 */
function saveSprites(images, options, sprites) {
	return new Promise(function (resolve, reject) {
		if (!fs.existsSync(options.spritePath)) {
			mkdirp.sync(options.spritePath);
		}

		var all = _
			.chain(sprites)
			.map(function (sprite) {
				sprite.path = makeSpritePath(options, sprite.groups);

				// If this file is up to date
				if (sprite.isFromCache) {
					var deferred = Promise.pending();
					log('Lazysprite:', gutil.colors.green(sprite.path), 'unchanged.');
					deferred.resolve(sprite);
					return deferred.promise;
				}

				// Save new file version
				return fs.writeFileAsync(sprite.path, new Buffer(sprite.image, 'binary'))
					.then(function () {
						log('Lazysprite:', gutil.colors.yellow(sprite.path), 'generated.');
						return sprite;
					});
			})
			.value();

		Promise.all(all)
			.then(function (sprites) {
				resolve([images, options, sprites]);
			})
			.catch(function (err) {
				if (err) {
					reject(err);
				}
			});
	});
}

/**
 * Map sprites props for every image.
 * @param  {Object} options
 * @param  {Array}  images
 * @param  {Array}  sprites
 * @return {Promise}
 */
function mapSpritesProperties(images, options, sprites) {
	return new Promise(function (resolve) {
		sprites = _.map(sprites, function (sprite) {
			return _.map(sprite.coordinates, function (coordinates, imagePath) {
				return _.merge(_.find(images, {path: imagePath}), {
					coordinates: coordinates,
					spritePath: sprite.path,
					properties: sprite.properties
				});
			});
		});
		resolve([images, options, sprites]);
	});
}

/**
 * Updates the CSS references from the token info.
 * @param  {Node}   css
 * @param  {Object} options
 * @param  {Array}  images
 * @param  {Array}  sprites
 * @return {Promise}
 */
function updateReferences(images, options, sprites, css) {
	return new Promise(function (resolve) {
		css.walkComments(function (comment) {
			var rule, image, backgroundImage, backgroundPosition, backgroundSize;
			// Manipulate only token comments
			if (isToken(comment)) {
				// Match from the path with the tokens comments
				image = _.find(images, {path: comment.text});
				if (image) {
					// Generate correct ref to the sprite
					image.spriteRef = path.relative(image.stylesheetPath, image.spritePath);
					image.spriteRef = image.spriteRef.split(path.sep).join('/');

					backgroundImage = postcss.decl({
						prop: 'background-image',
						value: getBackgroundImageUrl(image)
					});

					backgroundPosition = postcss.decl({
						prop: 'background-position',
						value: getBackgroundPosition(image)
					});

					// Replace the comment and append necessary properties.
					comment.replaceWith(backgroundImage);

					// Output the dimensions (only with 1x)
					rule = backgroundImage.parent;
					if (options.outputDimensions && image.ratio === 1) {
						['height', 'width'].forEach(function (prop) {
							rule.insertAfter(
								backgroundImage,
								postcss.decl({
									prop: prop,
									value: image.coordinates[prop] + 'px'
								})
							);
						});
					}

					rule.insertAfter(backgroundImage, backgroundPosition);

					if (image.ratio > 1) {
						backgroundSize = postcss.decl({
							prop: 'background-size',
							value: getBackgroundSize(image)
						});

						backgroundPosition.parent.insertAfter(backgroundPosition, backgroundSize);
					}
				}
			}
		});

		resolve([images, options, sprites, css]);
	});
}

/* --------------------------------------------------------------
 # Helpers
 -------------------------------------------------------------- */

// Get the value of Atrule and trim to string without quote.
function getAtRuleValue(params) {
	var value = params[0];
	value = _.trim(value, '\'"()');
	return value;
}

// Set the sprite file name form groups.
function makeSpritePath(options, groups) {
	var base = options.spritePath;
	var file = path.resolve(base, groups.join('.') + '.png');
	return file.replace('.@', '@');
}

// Mask function
function mask(toggle) {
	var input = new RegExp('[' + (toggle ? GROUP_DELIMITER : GROUP_MASK) + ']', 'gi');
	var output = toggle ? GROUP_MASK : GROUP_DELIMITER;
	return function (value) {
		return value.replace(input, output);
	};
}

// RegExp to match `@replace` comments
function isToken(comment) {
	return /@replace/gi.test(comment.toString());
}

// Return the value for background-image property
function getBackgroundImageUrl(image) {
	var template = _.template('url(<%= image.spriteRef %>)');
	return template({image: image});
}

// Return the value for background-position property
function getBackgroundPosition(image) {
	var x = -1 * (image.ratio > 1 ? image.coordinates.x / image.ratio : image.coordinates.x);
	var y = -1 * (image.ratio > 1 ? image.coordinates.y / image.ratio : image.coordinates.y);
	var template = _.template('<%= (x ? x + "px" : x) %> <%= (y ? y + "px" : y) %>');
	return template({x: x, y: y});
}

// Return the value for background-size property.
function getBackgroundSize(image) {
	var x = image.properties.width / image.ratio;
	var y = image.properties.height / image.ratio;
	var template = _.template('<%= x %>px <%= y %>px');

	return template({x: x, y: y});
}

// Check whether the image is retina
function isRetinaImage(url) {
	return /@(\d)x\.[a-z]{3,4}$/gi.test(url.split('#')[0]);
}

// Return the value of retina ratio.
function getRetinaRatio(url) {
	var matches = /@(\d)x\.[a-z]{3,4}$/gi.exec(url.split('#')[0]);
	var ratio = _.parseInt(matches[1]);
	return ratio;
}

// Check whether all images are retina. should both with 1x and 2x
function areAllRetina(images) {
	return _.every(images, function (image) {
		return image.ratio > 1;
	});
}

// Log with same stylesheet
function log() {
	var data = Array.prototype.slice.call(arguments);
	gutil.log.apply(false, data);
}
