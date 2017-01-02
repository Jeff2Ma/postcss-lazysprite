var path = require('path');
var fs = require('fs');
var postcss = require('postcss');
var lodash = require('lodash');
var Q = require('q');
var async = require('async');
var spritesmith = require('spritesmith').run;
var mkdirp = require('mkdirp');
var md5 = require('md5');
var gutil = require('gulp-util');

var space = postcss.list.space;

// 构建 @media 的查询规则
var defaultResolutions = [
	'(min--moz-device-pixel-ratio: 1.5)',
	'(-o-min-device-pixel-ratio: 3/2)',
	'(-webkit-min-device-pixel-ratio: 1.5)',
	'(min-device-pixel-ratio: 1.5)',
	'(min-resolution: 144dpi)',
	'(min-resolution: 1.5dppx)'
];

var GROUP_DELIMITER   = '.';
var GROUP_MASK        = '*';

// cache objects;
var cache = {};
var cacheIndex = {};

/**
 * main function
 */
module.exports = postcss.plugin('postcss-lazysprite', function (opts) {
	// opts
	opts = opts || {};
	opts.groupBy = opts.groupBy || [];
	opts.padding = opts.padding ? opts.padding : 10;
	// opts.outputDimensions = opts.outputDimensions || true;

	// paths
	opts.imagePath = path.resolve(process.cwd(), opts.imagePath || '');
	opts.spritePath = path.resolve(process.cwd(), opts.spritePath || '');

	// Group retina images
	opts.groupBy.unshift(function (image) {
		if (image.ratio > 1) {
			return '@' + image.ratio + 'x';
		}
		return null;
	});

	return function (css) {
		// if file path
		return Q
		// 准备工作
		.all([collectImages(css, opts), opts])
		.spread(applyGroupBy)
		.spread(function (images, opts) {
			return setTokens(images, opts, css);
		})
		// 合成雪碧图及生成样式
		.spread(runSpriteSmith)
		.spread(saveSprites)
		.spread(mapSpritesProperties)
		.spread(function (images, opts, sprites) {
			return updateReferences(images, opts, sprites, css);
		});
	};
});

/**
 * 从CSS 规则中获取到目标图片
 *
 */
function collectImages(css, opts) {
	var images = [];
	var stylesheetPath = opts.stylesheetPath || path.dirname(css.source.input.file);

	if (!stylesheetPath) {
		throw 'Stylesheets path is undefined, please use option stylesheetPath!';
	}

	// 查找到含有 @lazysprite 的样式
	css.walkAtRules("lazysprite", function (atRule) {

		// 从 @lazysprite 获取到目标目录
		var params = space(atRule.params);
		var sliceDir = params[0];
		sliceDir = lodash.trim(sliceDir, "'\"()");
		var imageDir = path.resolve(opts.imagePath,sliceDir);

		// 遍历雪碧图源图片 TODO: 改成异步方式
		var files = fs.readdirSync(imageDir);
		files.forEach(function (filename) {

			// 需检测为png 图片
			var reg = /\.(png|svg)\b/i;
			if (!reg.test(filename)) {return;}

			var image = {
				path: null,
				url: null,
				stylesheetPath: stylesheetPath,
				ratio: 1,
				groups: [],
				token: ''
			};
			image.url = filename;

			// 获取到所在目录作为合成后的图片名称
			// 获取到最后一个数组 .pop
			image.hash = imageDir.split(path.sep).pop();
			image.groups = [image.hash];
			image.selector = image.url.split('.')[0];

			// retina 图片兼容
			if (isRetinaImage(image.url)) {
				image.ratio  = getRetinaRatio(image.url);
				image.selector = image.url.split('@')[0];
			}

			// 获取到图片绝对路径
			image.path = path.resolve(imageDir, filename);
			images.push(image);
		});

	});
	return lodash.uniqWith(images, lodash.isEqual);
}

/**
 * 分组
 *
 */
function applyGroupBy(images, opts) {
	return Q.Promise(function (resolve, reject) {
		async.reduce(opts.groupBy, images, function (images, group, next) {
			async.map(images, function (image, done) {
				new Q(group(image))
					.then(function (group) {
						if (group) {
							image.groups.push(group);
						}
						done(null, image);
					})
					.catch(done);
			}, next);
		}, function (err, images) {
			if (err) {
				return reject(err);
			}
			resolve([images, opts]);
		});
	});
}

/**
 * 生成CSS Rules 并插入必要的信息
 *
 */
function setTokens(images, opts, css) {
	return Q.Promise(function (resolve) {

		css.walkAtRules("lazysprite", function (atRule) {

			var atRuleParent = atRule.parent;
			var params = defaultResolutions.join(', ');
			var mediaAtRule = postcss.atRule({ name: 'media', params: params });

			// 遍历信息并生成相应的样式
			lodash.forEach(images, function (image, index) {
				image.token = postcss.comment({
					text: image.path,
					raws: {
						before: ' ',
						left: '@replace|',
						right: ''
					}
				});

				// 二倍图
				if (image.ratio > 1) {
					var retinaRule = postcss.rule({ selector:'.icon-'+image.selector});
					retinaRule.append(image.token);
					mediaAtRule.append(retinaRule);
				} else {
					 // 一倍图
					var singleRule = postcss.rule({ selector:'.icon-'+image.selector});
					singleRule.append(image.token);
					atRuleParent.append(singleRule);
				}
			});

			// 二倍图样式放到最后
			atRuleParent.append(mediaAtRule);
			// 删除 @lazysprite
			atRule.remove();
		});
		resolve([images, opts]);
	});
}

/**
 * 通过 SpriteSmith 生成雪碧图
 *
 */
function runSpriteSmith(images, opts) {
	return Q.Promise(function (resolve, reject) {
		var all = lodash
			.chain(images)
			.groupBy(function (image) {
				var temp;

				temp = image.groups.map(mask(true));
				temp.unshift('_');

				return temp.join(GROUP_DELIMITER);
			})
			.map(function (images, temp) {
				var config = lodash.merge({}, opts, {
					src: lodash.map(images, 'path')
				});
				var ratio;

				// Enlarge padding for retina images
				if (areAllRetina(images)) {
					ratio = lodash
						.chain(images)
						.flatMap('ratio')
						.uniq()
						.value();

					if (ratio.length === 1) {
						config.padding = config.padding * ratio[0];
					}
				}

				var checkstring = [];

				// collect images datechanged
				config.spriteName = temp.replace(/^_./, '').replace(/.@/, '@');
				lodash.each(config.src, function (image) {
					checkstring.push(image + '=' + md5(fs.readFileSync(image).toString()));
				});

				checkstring = md5(checkstring.join('&'));

				log(checkstring);

				// get data from cache (avoid spritesmith)
				if (cache[checkstring]) {
					var deferred = Q.defer();
					var results = cache[checkstring];

					results.isFromCache = true;
					deferred.resolve(results);
					return deferred.promise;
				}

				return Q.nfcall(spritesmith, config)
					.then(function (result) {
						temp = temp.split(GROUP_DELIMITER);
						temp.shift();

					  	// Append info about sprite group
						result.groups = temp.map(mask(false));

						// cache - clean old
						var oldCheckstring = cacheIndex[config.spriteName];
						if (oldCheckstring && cache[oldCheckstring]) {
							delete cache[oldCheckstring];
						}

						// cache - add brand new data
						cacheIndex[config.spriteName] = checkstring;
						cache[checkstring] = result;

						return result;
					});
			})
			.value();

		Q.all(all)
			.then(function (results) {
				resolve([images, opts, results]);
			})
			.catch(function (err) {
				if (err) {
					reject(err);
				}
			});
	});
}

/**
 * 保存雪碧图
 *
 */
function saveSprites(images, opts, sprites) {
	return Q.Promise(function (resolve, reject) {

		if (!fs.existsSync(opts.spritePath)) {
			mkdirp.sync(opts.spritePath);
		}

		var all = lodash
			.chain(sprites)
			.map(function (sprite) {
				sprite.path = makeSpritePath(opts, sprite.groups);

				// if this file is up to date
				if (sprite.isFromCache) {
					var deferred = Q.defer();
					log('Lazysprite:', gutil.colors.green(sprite.path), 'unchanged.');
					deferred.resolve(sprite);
					return deferred.promise;
				}

				// save new file version
				return Q.nfcall(fs.writeFile, sprite.path, new Buffer(sprite.image, 'binary'))
					.then(function () {
						log('Lazysprite:', gutil.colors.yellow(sprite.path), 'generated.');
						return sprite;
					});
			})
			.value();

		Q.all(all)
			.then(function (sprites) {
				resolve([images, opts, sprites]); })
			.catch(function (err) {
				if (err) {
					reject(err);
				}
			});
	});
}

/**
 * 为每张图片标记位置信息
 *
 */
function mapSpritesProperties(images, opts, sprites) {
	return Q.Promise(function (resolve) {

		sprites = lodash.map(sprites, function (sprite) {
			return lodash.map(sprite.coordinates, function (coordinates, imagePath) {

				return lodash.merge(lodash.find(images, { path: imagePath }), {
					coordinates: coordinates,
					spritePath: sprite.path,
					properties: sprite.properties
				});
			});
		});

		resolve([images, opts, sprites]);
	});
}

/**
 * 更新对应的CSS 样式
 *
 */
function updateReferences(images, opts, sprites, css) {
	return Q.Promise(function (resolve) {
		css.walkComments(function (comment) {
			var rule, image, backgroundImage, backgroundPosition, backgroundSize;

			// Manipulate only token comments
			if (isToken(comment)) {

				// 通过匹配注释中的路径找到目标的 Rule
				image = lodash.find(images, { path: comment.text });

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

					// Output the dimensions
					rule = backgroundImage.parent;
					if (opts.outputDimensions) {
						['height', 'width'].forEach(function (prop) {
							rule.insertAfter(
								backgroundImage,
								postcss.decl({
									prop: prop,
									value: (image.ratio > 1 ?
										image.coordinates[prop] / image.ratio :
										image.coordinates[prop]) + 'px',
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

		resolve([images, opts, sprites, css]);
	});
}


function makeSpritePath(opts, groups) {
	var base = opts.spritePath;
	var file = path.resolve(base, groups.join('.') + '.png');
	return file.replace('.@', '@');
}

function mask(toggle) {
	var input  = new RegExp('[' + (toggle ? GROUP_DELIMITER : GROUP_MASK) + ']', 'gi');
	var output = toggle ? GROUP_MASK : GROUP_DELIMITER;
	return function (value) {
		return value.replace(input, output);
	};
}

function resolveUrl(image, opts) {
	var results;
	if (/^\//.test(image.url)) {
		results = path.resolve(opts.imagePath, image.url.replace(/^\//, ''));
	} else {
		results = path.resolve(image.stylesheetPath, image.url);
	}

	// get rid of get params and hash;
	return results.split('#')[0].split('?')[0];
}

// 正则匹配 @replace 的注释
function isToken(comment) {
	return /@replace/gi.test(comment.toString());
}

/**
 * Return the value for background-image property.
 *
 */
function getBackgroundImageUrl(image) {
	var template = lodash.template('url(<%= image.spriteRef %>)');
	return template({ image: image });
}

/**
 * Return the value for background-position property.
 *
 */
function getBackgroundPosition(image) {
	var x = -1 * (image.ratio > 1 ? image.coordinates.x / image.ratio : image.coordinates.x);
	var y = -1 * (image.ratio > 1 ? image.coordinates.y / image.ratio : image.coordinates.y);
	var template = lodash.template('<%= (x ? x + "px" : x) %> <%= (y ? y + "px" : y) %>');

	return template({ x: x, y: y });
}

/**
 * Return the value for background-size property.
 *
 */
function getBackgroundSize(image) {
	var x = image.properties.width / image.ratio;
	var y = image.properties.height / image.ratio;
	var template = lodash.template('<%= x %>px <%= y %>px');

	return template({ x: x, y: y });
}

/**
 * Check whether the image is retina.
 */
function isRetinaImage(url) {
	return /@(\d)x\.[a-z]{3,4}$/gi.test(url.split('#')[0]);
}

/**
 * Return the retina ratio.
 *
 */
function getRetinaRatio(url) {
	var matches = /@(\d)x\.[a-z]{3,4}$/gi.exec(url.split('#')[0]);
	var ratio   = lodash.parseInt(matches[1]);
	return ratio;
}

/**
 * Check whether all images are retina. TODO：必须同时处理含有 1x 与2x 的图片
 *
 */
function areAllRetina(images) {
	return lodash.every(images, function (image) {
		return image.ratio > 1;
	});
}

/**
 * log with same stylesheet.
 *
 */
function log() {
	var data = Array.prototype.slice.call(arguments);
	gutil.log.apply(false, data);
}

/**
 * fix the string for path resolve.
 *
 */
function cleanupRemoteFile(value) {
	value = trim(value, "'\"()");
	return value;
}
