var path = require('path');
var fs = require('fs');
var postcss = require('postcss');
var _ = require('lodash');
var spritesmith = require('spritesmith').run;
var mkdirp = require('mkdirp');
var md5 = require('spark-md5').hash;
var gutil = require('gulp-util');
var revHash = require('rev-hash');
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
	// Default Options
	options = options || {};

	options = _.merge({
		groupBy: options.groupBy || [],
		padding: options.padding ? options.padding : 10,
		nameSpace: options.nameSpace || '',
		outputDimensions: options.outputDimensions || true,
		smartUpdate: options.smartUpdate || true,
		logLevel: options.logLevel || 'debug'  // 'debug','info','slient'
	}, options);

	// Option `imagePath` is required
	if (!options.imagePath) {
		throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red('Option `imagePath` is undefined!' +
			' Please set it and restart.')]);
	}

	// Paths
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
			})
			.catch(function (err) {
				throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red(err.message)]);
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
		log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red('option `stylesheetPath` is undefined!')]);
	}

	// Find @lazysprite string from css
	css.walkAtRules('lazysprite', function (atRule) {
		// Get the directory of images from atRule value
		var params = space(atRule.params);
		var sliceDir = getAtRuleValue(params);

		// Get absolute path of directory.
		var imageDir = path.resolve(options.imagePath, sliceDir);

		// check whether dir exist.
		if (!fs.existsSync(imageDir)) {
			log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red('No exist "' + imageDir + '"')]);
			return null;
		}

		// Foreach the images and set image object.
		var files = fs.readdirSync(imageDir);
		files.forEach(function (filename) {
			// Have to be png file
			var reg = /\.(png)\b/i;
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
			image.selector = image.dir + '__icon-' + getBaseName(image.name, '.png');

			// For retina
			if (isRetinaImage(image.name)) {
				image.ratio = getRetinaRatio(image.name);
				image.selector = image.dir + '__icon-' + getBaseName(image.name, '.png', true);
			}

			// Get absfolute path of image
			image.path = path.resolve(imageDir, filename);

			// Push image obj to array.
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

				var checkString = [];

				_.each(config.src, function (image) {
					var checkBuffer = fs.readFileSync(image);
					var checkHash = revHash(checkBuffer);
					checkString.push(checkHash);
				});

				// Get the group files hash so that next step can SmartUpdate.
				checkString = md5(_.sortBy(checkString).join('&'));
				config.groupHash = checkString.slice(0, 10);

				// Collect images datechanged
				config.spriteName = temp.replace(/^_./, '').replace(/.@/, '@');

				// Get data from cache (avoid spritesmith)
				if (cache[checkString]) {
					var deferred = Promise.pending();
					var results = cache[checkString];
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

						// Pass the group file hash for next `saveSprites` function.
						result.groupHash = config.groupHash;

						// Cache - clean old
						var oldCheckString = cacheIndex[config.spriteName];
						if (oldCheckString && cache[oldCheckString]) {
							delete cache[oldCheckString];
						}

						// Cache - add brand new data
						cacheIndex[config.spriteName] = checkString;
						cache[checkString] = result;

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
				sprite.path = makeSpritePath(options, sprite.groups, sprite.groupHash);
				var deferred = Promise.pending();

				// If this file is up to date
				if (sprite.isFromCache) {
					log(options.logLevel, 'lv2', ['Lazysprite:', gutil.colors.yellow(sprite.path), 'unchanged.']);
					deferred.resolve(sprite);
					return deferred.promise;
				}

				// If this sprites image file is exist. Only work when option `smartUpdate` is true.
				if (options.smartUpdate) {
					sprite.filename = sprite.groups.join('.') + '.' + sprite.groupHash + '.png';
					sprite.filename = sprite.filename.replace('.@', '@');
					if (fs.existsSync(sprite.path)) {
						log(options.logLevel, 'lv2', ['Lazysprite:', gutil.colors.yellow(sprite.path), 'already' +
						' existed.']);
						deferred.resolve(sprite);
						return deferred.promise;
					}
				}

				// Save new file version
				return fs.writeFileAsync(sprite.path, new Buffer(sprite.image, 'binary'))
					.then(function () {
						log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.green(sprite.path), 'generated.']);
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

// Get the base name of file.
// Example1: demo.png/demo@2x.png/demo_2x.png ==> demo
// Example2: demo.new.png/demo.new@2x.png  ==> demo.new
// Note: 'extname' should like `.png`(also as default)
function getBaseName(filepath, extname, retina) {
	extname = extname || '.png';
	retina = retina || false;
	var basename = path.basename(filepath, extname);
	if (retina) {
		basename = _.trimEnd(basename, '@2x');
		basename = _.trimEnd(basename, '@3x');
		basename = _.trimEnd(basename, '_2x');
		basename = _.trimEnd(basename, '_3x');
	}
	return basename;
}

// Set the sprite file name form groups.
function makeSpritePath(options, groups, groupHash) {
	var base = options.spritePath;
	var file;
	if (options.smartUpdate) {
		file = path.resolve(base, groups.join('.') + '.' + groupHash + '.png');
	} else {
		file = path.resolve(base, groups.join('.') + '.png');
	}
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

// Check whether the image is retina,
// Both `@2x` and `_2x` are support.
function isRetinaImage(url) {
	return /[@_](\d)x\.[a-z]{3,4}$/gi.test(url);
}

// Return the value of retina ratio.
function getRetinaRatio(url) {
	var matches = /[@_](\d)x\.[a-z]{3,4}$/gi.exec(url);
	if (!matches) {
		return 1;
	}
	var ratio = _.parseInt(matches[1]);
	return ratio;
}

// Check whether all images are retina. should both with 1x and 2x
function areAllRetina(images) {
	return _.every(images, function (image) {
		return image.ratio > 1;
	});
}

// Log with same stylesheet and level control.
function log(logLevel, level, content) {
	var output = true;

	switch (logLevel) {
	case 'slient':
		output = false;
		break;
	case 'info':
		if (level === 'lv2') {
			output = false;
		}
		break;
	default:
		output = true;
	}
	if (output) {
		var data = Array.prototype.slice.call(content);
		gutil.log.apply(false, data);
	}
}
