var path = require('path');
var fs = require('fs');
var postcss = require('postcss');
var _ = require('lodash');
var spritesmith = require('spritesmith').run;
var mkdirp = require('mkdirp');
var md5 = require('spark-md5').hash;
var revHash = require('rev-hash');
var Promise = require('bluebird');
var colors = require('ansi-colors');
var fancyLog = require('fancy-log');
var SVGSpriter = require('svg-sprite');

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
var GROUP_SVG_FLAG = '@svgGroup';

var SVG_CONFIG = {
	mode: {
		css: {
			dimensions: true,
			bust: false,
			render: {
				css: true
			}
		}
	},
	shape: {
		id: {
			generator: function (name, file) {
				return Buffer.from(file.path).toString('base64');
			}
		}
	},
	svg: {
		precision: 5
	}
};

// Cache objects
var cache = {};
var cacheIndex = {};

/* --------------------------------------------------------------
 # Main functions
 -------------------------------------------------------------- */
module.exports = postcss.plugin('postcss-lazysprite', function (options) {
	// Default Options
	options = options || {};

	options = _.merge({
		cloneRaws: options.cloneRaws || {},
		groupBy: options.groupBy || [],
		padding: options.padding ? options.padding : 10,
		nameSpace: options.nameSpace || '',
		outputDimensions: options.outputDimensions || true,
		outputExtralCSS: options.outputExtralCSS || false,
		smartUpdate: options.smartUpdate || false,
		retinaInfix: options.retinaInfix || '@', // Decide '@2x' or '_2x'
		logLevel: options.logLevel || 'info', // 'debug','info','slient'
		cssSeparator: options.cssSeparator || '__', // Separator between block and element.
		pseudoClass: options.pseudoClass || false
	}, options);

	// Option `stylesheetPath` is deprecated,
	// so has to give a tip for preview users.
	if (options.stylesheetPath) {
		throw log(options.logLevel, 'lv1', ['Lazysprite:', colors.red('Option `stylesheetPath` was deprecated!' +
			' Please use `stylesheetRelative` to replace.')]);
	}

	// Option `imagePath` is required
	if (!options.imagePath) {
		throw log(options.logLevel, 'lv1', ['Lazysprite:', colors.red('Option `imagePath` is undefined!' +
			' Please set it and restart.')]);
	}

	// Option `stylesheetInput` is required
	if (!options.stylesheetInput) {
		throw log(options.logLevel, 'lv1', ['Lazysprite:', colors.red('Option `stylesheetInput` is undefined!' +
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

	// Svg sprite config
	options.svgsprite = SVG_CONFIG;

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
				throw log(options.logLevel, 'lv1', ['Lazysprite:', colors.red(err.message)]);
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
	var stylesheetRelative = options.stylesheetRelative || path.dirname(css.source.input.file);

	if (!stylesheetRelative) {
		log(options.logLevel, 'lv1', ['Lazysprite:', colors.red('option `stylesheetRelative` is undefined!')]);
	}

	// When the css file is in the second or more depth level directory of destination
	// which relative to `stylesheetRelative`,
	// ref path in css will wrong, so has to be fix it.
	if (css.source.input.file) {
		var stylesheetInputDirRelative = path.relative(options.stylesheetInput, path.dirname(css.source.input.file));
		stylesheetRelative = path.join(stylesheetRelative, stylesheetInputDirRelative);
	}

	// Find @lazysprite string from css
	css.walkAtRules('lazysprite', function (atRule) {
		// Get the directory of images from atRule value
		var params = space(atRule.params);
		var atRuleValue = getAtRuleValue(params);
		var sliceDir = atRuleValue[0];

		// Get absolute path of directory.
		var imageDir = path.resolve(options.imagePath, sliceDir);

		// Check whether dir exist.
		if (!fs.existsSync(imageDir)) {
			log(options.logLevel, 'lv1', ['Lazysprite:', colors.red('No exist "' + imageDir + '"')]);
			return null;
		}

		// Get indent format of the css content.
		var atRuleNext = atRule.parent.nodes;
		var rawNode = _.find(atRuleNext, function (node) {
			return node.type === 'rule';
		});

		// Store the indent format.
		if (rawNode === undefined) {
			options.cloneRaws.between = '';
			options.cloneRaws.after = '';
		} else {
			options.cloneRaws.between = rawNode.raws.between;
			options.cloneRaws.after = rawNode.raws.after;
		}

		// Foreach the images and set image object.
		var files = fs.readdirSync(imageDir);
		files = _.orderBy(files); // Fix orders issue in mac and win's difference.
		_.forEach(files, function (filename) {
			// Have to be png file
			var reg = /\.(png|svg)\b/i;
			if (!reg.test(filename)) {
				return null;
			}

			var image = {
				path: null, // Absolute path
				name: null, // Filename
				stylesheetRelative: stylesheetRelative,
				ratio: 1,
				groups: [],
				isSVG: false,
				token: ''
			};

			image.name = filename;

			// Set the directory name as sprite file name,
			// .pop() to get the last element in array
			image.dir = imageDir.split(path.sep).pop();
			image.groups = [image.dir];

			// For svg file
			if (/^\.svg/.test(path.extname(filename))) {
				image.isSVG = true;
				image.groups.push('GROUP_SVG_FLAG');
			}

			image.selector = setSelector(image, options, atRuleValue[1]);

			// Get absolute path of image
			image.path = path.resolve(imageDir, filename);

			// For retina
			if (isRetinaImage(image.name)) {
				image.ratio = getRetinaRatio(image.name);
				image.selector = setSelector(image, options, atRuleValue[1], true);
			}

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
			var atRuleValue = getAtRuleValue(params);
			var sliceDir = atRuleValue[0];
			var sliceDirname = sliceDir.split(path.sep).pop();
			var atRuleParent = atRule.parent;
			var mediaAtRule2x = postcss.atRule({name: 'media', params: resolutions2x.join(', ')});
			var mediaAtRule3x = postcss.atRule({name: 'media', params: resolutions3x.join(', ')});

			// Tag flag
			var has2x = false;
			var has3x = false;

			if (options.outputExtralCSS) {
				var outputExtralCSSRule = postcss.rule({
					selector: '.' + options.nameSpace + (atRuleValue[1] ? atRuleValue[1] : sliceDirname),
					source: atRule.source
				});

				outputExtralCSSRule.append({prop: 'display', value: 'inline-block'});
				outputExtralCSSRule.append({prop: 'overflow', value: 'hidden'});
				outputExtralCSSRule.append({prop: 'font-size', value: '0'});
				outputExtralCSSRule.append({prop: 'line-height', value: '0'});
				atRule.before(outputExtralCSSRule);
			}

			// Foreach every image object
			_.forEach(images, function (image) {
				// Only work when equal to directory name
				if (sliceDirname === image.dir) {
					image.token = postcss.comment({
						text: image.path,
						raws: {
							between: options.cloneRaws.between,
							after: options.cloneRaws.after,
							left: '@replace|',
							right: ''
						}
					});

					// Add `source` argument for source map create.
					var singleRule = postcss.rule({
						selector: '.' + options.nameSpace + image.selector,
						source: atRule.source
					});

					singleRule.append(image.token);

					switch (image.ratio) {
					// @1x
					case 1:
						atRuleParent.insertBefore(atRule, singleRule);
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
				atRuleParent.insertBefore(atRule, mediaAtRule2x);
			}
			if (has3x) {
				atRuleParent.insertBefore(atRule, mediaAtRule3x);
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

				var checkString = [];

				_.each(config.src, function (image) {
					var checkBuffer = fs.readFileSync(image);
					var checkHash = revHash(checkBuffer);
					checkString.push(checkHash);
				});

				// Get the group files hash so that next step can SmartUpdate.
				checkString = md5(_.sortBy(checkString).join('&'));

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

				// SVG SPRITES MOD.
				if (temp.indexOf('GROUP_SVG_FLAG') > -1) {
					var svgConfig = _.defaultsDeep({src: _.map(images, 'path')}, options.svgsprite);

					var spriter = new SVGSpriter(svgConfig);

					_.forEach(images, function (item) {
						spriter.add(item.path, null, fs.readFileSync(item.path, {encoding: 'utf-8'}));
					});

					return Promise.promisify(spriter.compile, {
						context: spriter,
						multiArgs: true
					})().spread(function (result, data) {
						var spritesheet = {};
						spritesheet.extension = 'svg';
						spritesheet.coordinates = {};
						spritesheet.image = result.css.sprite.contents;
						spritesheet.properties = {
							width: data.css.spriteWidth,
							height: data.css.spriteHeight
						};

						data.css.shapes.forEach(function (shape) {
							spritesheet.coordinates[Buffer.from(shape.name, 'base64').toString()] = {
								width: shape.width.outer,
								height: shape.height.outer,
								x: shape.position.absolute.x,
								y: shape.position.absolute.y
							};
						});

						return spritesheet;
					}).then(function (result) {
						temp = temp.split(GROUP_DELIMITER);
						temp.shift();
						// Append info about sprite group
						result.groups = temp.map(mask(false));
						var oldCheckString = cacheIndex[config.spriteName];
						if (oldCheckString && cache[oldCheckString]) {
							delete cache[oldCheckString];
						}

						// Cache - add brand new data
						cacheIndex[config.spriteName] = checkString;
						cache[checkString] = result;
						return result;
					});
				}

				// NORMAL MOD (spritesmith)

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

				return Promise.promisify(spritesmith)(config)
					.then(function (result) {
						temp = temp.split(GROUP_DELIMITER);
						temp.shift();

						// Append info about sprite group
						result.groups = temp.map(mask(false));

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
				sprite.path = makeSpritePath(options, sprite.groups);
				var deferred = Promise.pending();

				// If this file is up to date
				if (sprite.isFromCache) {
					log(options.logLevel, 'lv3', ['Lazysprite:', colors.yellow(path.relative(process.cwd(), sprite.path)), 'unchanged.']);
					deferred.resolve(sprite);
					return deferred.promise;
				}

				// Save new file version
				return fs.writeFileAsync(sprite.path, Buffer.from(sprite.image, 'binary'))
					.then(function () {
						log(options.logLevel, 'lv2', ['Lazysprite:', colors.green(path.relative(process.cwd(), sprite.path)), 'generated.']);
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
					// 2x check even dimensions.
					if (image.ratio === 2 && (image.coordinates.width % 2 !== 0 || image.coordinates.height % 2 !== 0)) {
						throw log(options.logLevel, 'lv1', ['Lazysprite:', colors.red(path.relative(process.cwd(), image.path)), '`2x` image should have' +
						' even dimensions.']);
					}

					// 3x check dimensions.
					if (image.ratio === 3 && (image.coordinates.width % 3 !== 0 || image.coordinates.height % 3 !== 0)) {
						throw log(options.logLevel, 'lv1', ['Lazysprite:', colors.red(path.relative(process.cwd(), image.path)), '`3x` image should have' +
						' correct dimensions.']);
					}

					// Generate correct ref to the sprite
					image.spriteRef = path.relative(image.stylesheetRelative, image.spritePath);
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
					if (options.outputDimensions && image.ratio === 1) {
						['height', 'width'].forEach(function (prop) {
							backgroundImage.after(
								postcss.decl({
									prop: prop,
									value: (image.ratio > 1 ? image.coordinates[prop] / image.ratio : image.coordinates[prop]) + 'px'
								})
							);
						});
					}

					backgroundImage.after(backgroundPosition);

					if (image.ratio > 1) {
						backgroundSize = postcss.decl({
							prop: 'background-size',
							value: getBackgroundSize(image)
						});

						backgroundPosition.after(backgroundSize);
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
	var array = [];
	value = _.trim(value, '\'"()');
	if (value.indexOf('#') > -1) {
		value = value.split('#');
		return value;
	}
	array.push(value);
	return array;
}

// Set the class name.
// Also deal with retina, `:hover` css class contexts.
function setSelector(image, options, dynamicBlock, retina) {
	dynamicBlock = dynamicBlock || false;
	retina = retina || false;
	var basename = image.isSVG ? path.basename(image.name, '.svg') : path.basename(image.name, '.png');
	if (retina) {
		// If retina, then '@2x','@3x','_2x','_3x' will be removed.
		basename = _.replace(basename, /[@_](\d)x$/, '');
	}
	var selector = (dynamicBlock ? dynamicBlock : image.dir) + options.cssSeparator + basename;
	if (options.pseudoClass) {
		if (image.name.toLowerCase().indexOf('hover') > -1 || image.name.toLowerCase().indexOf('active') > -1) {
			selector = _.replace(selector, 'Hover', ':hover');
			selector = _.replace(selector, 'Active', ':active');
			selector = _.replace(selector, '_hover', ':hover');
			selector = _.replace(selector, '_active', ':active');
		}
	}
	return selector;
}

// Set the sprite file name form groups.
function makeSpritePath(options, groups) {
	var base = options.spritePath;
	var file;

	// If is svg, do st
	if (groups.indexOf('GROUP_SVG_FLAG') > -1) {
		groups = _.filter(groups, function (item) {
			return item !== 'GROUP_SVG_FLAG';
		});
		file = path.resolve(base, groups.join('.') + '.svg');
	} else {
		file = path.resolve(base, groups.join('.') + '.png');
	}

	return file.replace('.@', options.retinaInfix);
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
	var logicValue = image.isSVG ? 1 : -1;
	var x = logicValue * (image.ratio > 1 ? image.coordinates.x / image.ratio : image.coordinates.x);
	var y = logicValue * (image.ratio > 1 ? image.coordinates.y / image.ratio : image.coordinates.y);
	var template = _.template('<%= (x ? x + "px" : x) %> <%= (y ? y + "px" : y) %>');
	return template({x: x, y: y});
}

// Return the pencentage value for background-position property
function getBackgroundPositionInPercent(image) {
	var x = 100 * (image.coordinates.x) / (image.properties.width - image.coordinates.width);
	var y = 100 * (image.coordinates.y) / (image.properties.height - image.coordinates.height);
	var template = _.template('<%= (x ? x + "%" : x) %> <%= (y ? y + "%" : y) %>');
	return template({x: x, y: y});
}

// Return the value for background-size property.
function getBackgroundSize(image) {
	var x = image.properties.width / image.ratio;
	var y = image.properties.height / image.ratio;
	var template = _.template('<%= x %>px <%= y %>px');

	return template({x: x, y: y});
}

// Check whether is '.png' file.
function isPNG(url) {
	return /.png$/gi.test(url);
}

// Check whether the image is retina,
// Both `@2x` and `_2x` are support.
function isRetinaImage(url) {
	return /[@_](\d)x\.[a-z]{3,4}$/gi.test(url);
}

// Check whether the image is retina,
// work with hashed naming filename,
// eg. `@2x.578cc898ef.png`, `_3x.bc11f5103f.png`
function isRetinaHashImage(url) {
	return /[@_](\d)x\.[a-z0-9]{6,10}\.[a-z]{3,4}$/gi.test(url);
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

// Get retina infix from file name
function getRetinaInfix(name) {
	var matches = /([@_])[0-9]x\.[a-z]{3,4}$/gi.exec(name);
	if (!matches) {
		return '@';
	}
	return matches[1];
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
		if (level !== 'lv1') {
			output = false;
		}
		break;
	case 'info':
		if (level === 'lv3') {
			output = false;
		}
		break;
	default:
		output = true;
	}
	if (output) {
		var data = Array.prototype.slice.call(content);
		fancyLog.apply(false, data);
	}
}

// Log for debug
function debug() {
	var data = Array.prototype.slice.call(arguments);
	fancyLog.apply(false, data);
}
