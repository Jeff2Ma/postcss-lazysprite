var path = require('path');
var fs = require('fs');
var postcss = require('postcss');
var _ = require('lodash');
var Q = require('q');
var async = require('async');
var spritesmith = require('spritesmith').run;
var mkdirp = require('mkdirp');
var md5 = require('md5');
var gutil = require('gulp-util');

var space = postcss.list.space;

// 构建 @media 的查询规则
// 2x
var resolutions2x = [
	'only screen and (-webkit-min-device-pixel-ratio: 2)',
	'only screen and (min--moz-device-pixel-ratio: 2)',
	'only screen and (-o-min-device-pixel-ratio: 2/1)',
	'only screen and (min-device-pixel-ratio: 2)',
	'only screen and (min-resolution: 2dppx)',
	'only screen and (min-resolution: 192dpi)'
];

// 3x 仅在移动设备上展示（目前并无桌面端）
var resolutions3x = [
	'only screen and (-webkit-min-device-pixel-ratio: 3)',
	'only screen and (min-resolution: 3dppx)'
];

var GROUP_DELIMITER = '.';
var GROUP_MASK = '*';

// cache objects;
var cache = {};
var cacheIndex = {};

/**
 * main function
 */
module.exports = postcss.plugin('postcss-lazysprite', function (options) {
	// options
	options = options || {};
	options.groupBy = options.groupBy || [];
	options.padding = options.padding ? options.padding : 10;
	// options.outputDimensions = options.outputDimensions || true;

	// 命名空间
	options.nameSpace = options.nameSpace || '';

	// 其它路径
	options.imagePath = path.resolve(process.cwd(), options.imagePath || '');
	options.spritePath = path.resolve(process.cwd(), options.spritePath || '');

	// Group retina images
	options.groupBy.unshift(function (image) {
		if (image.ratio > 1) {
			return '@' + image.ratio + 'x';
		}
		return null;
	});

	return function (css) {
		// if file path
		return collectImages(css, options) // 等同于 Q.all([images, options])
			.spread(applyGroupBy)
			.spread(function (images, options) {
				return setTokens(images, options, css);
			})
			// 合成雪碧图及生成样式
			.spread(runSpriteSmith)
			.spread(saveSprites)
			.spread(mapSpritesProperties)
			.spread(function (images, options, sprites) {
				return updateReferences(images, options, sprites, css);
			});
	};
});

/**
 * 从CSS 规则中获取到目标图片
 *
 */
function collectImages(css, options) {

	// TODO: 需要修正下 stylesheetPath 的处理
	var stylesheetPath = options.stylesheetPath || path.dirname(css.source.input.file);

	if (!stylesheetPath) {
		throw 'Stylesheets path is undefined, please use option stylesheetPath!';
	}

	// UPDATE: 1.4 改成 promise 的方式
	return Q.promise(function (resolve) {
		// 查找到含有 @lazysprite 的样式
		css.walkAtRules("lazysprite", function (atRule) {
			// 从 @lazysprite 获取到目标目录
			var params = space(atRule.params);
			var sliceDir = getAtRuleValue(params);

			// 获取目录绝对路径
			var imageDir = path.resolve(options.imagePath, sliceDir);

			// 获取到图片目录
			getImgList(imageDir, stylesheetPath).then(function (images) {
				imgages = _.uniqWith(images, _.isEqual);
				resolve(imgages);
			})
		});
	}).then(function (images) {
		// 必须返回 images, options 以后面调用
		return [images, options]
	});
}

/**
 * 分组
 *
 */
function applyGroupBy(images, options) {

	return Q.Promise(function (resolve, reject) {
		async.reduce(options.groupBy, images, function (images, group, next) {
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
			resolve([images, options]);
		});
	});
}

/**
 * 生成CSS Rules 并插入必要的信息
 *
 */
function setTokens(images, options, css) {
	return Q.Promise(function (resolve) {

		css.walkAtRules("lazysprite", function (atRule) {

			// 从 @lazysprite 获取到目标目录
			var params = space(atRule.params);
			var sliceDir = getAtRuleValue(params);
			var sliceDirname = sliceDir.split(path.sep).pop();

			var atRuleParent = atRule.parent;
			var mediaAtRule2x = postcss.atRule({name: 'media', params: resolutions2x.join(', ')});
			var mediaAtRule3x = postcss.atRule({name: 'media', params: resolutions3x.join(', ')});

			// 标记位
			var has2x = false;
			var has3x = false;

			// 遍历信息并生成相应的样式
			_.forEach(images, function (image, index) {
				// 当且仅当图片目录与目标hash 相等
				if (sliceDirname == image.hash) {
					image.token = postcss.comment({
						text: image.path,
						raws: {
							before: ' ',
							// before: '\n    ', // 设置这个就能控制decl 的缩进，但是效果不好
							left: '@replace|',
							right: ''
						}
					});

					// 基础的rule
					// 增加 source 参数以便source map 能正常工作
					var singleRule = postcss.rule({
						selector: '.' + options.nameSpace + image.selector,
						source: atRule.source
					});
					singleRule.append(image.token);

					switch (image.ratio) {
						// 1x
						case 1:
							atRuleParent.append(singleRule);
							break;
						// 2x
						case 2:
							mediaAtRule2x.append(singleRule);
							has2x = true;
							break;
						// 3x
						case 3:
							mediaAtRule3x.append(singleRule);
							has3x = true;
							break;
					}
				}
			});

			// 2、3 倍图样式放到最后
			if (has2x) {
				atRuleParent.append(mediaAtRule2x);
			}
			if (has3x) {
				atRuleParent.append(mediaAtRule3x);
			}

			// 删除 @lazysprite
			atRule.remove();
		});
		resolve([images, options]);
	});
}

/**
 * 通过 SpriteSmith 生成雪碧图
 *
 */
function runSpriteSmith(images, options) {
	return Q.Promise(function (resolve, reject) {
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

				// Enlarge padding for retina images
				if (areAllRetina(images)) {
					ratio = _
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
				_.each(config.src, function (image) {
					checkstring.push(image + '=' + md5(fs.readFileSync(image).toString()));
				});

				checkstring = md5(checkstring.join('&'));

				// log(checkstring);

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
 * 保存雪碧图
 *
 */
function saveSprites(images, options, sprites) {
	return Q.Promise(function (resolve, reject) {

		if (!fs.existsSync(options.spritePath)) {
			mkdirp.sync(options.spritePath);
		}

		var all = _
			.chain(sprites)
			.map(function (sprite) {
				sprite.path = makeSpritePath(options, sprite.groups);

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
 * 为每张图片标记位置信息
 *
 */
function mapSpritesProperties(images, options, sprites) {
	return Q.Promise(function (resolve) {

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
 * 更新对应的CSS 样式
 *
 */
function updateReferences(images, options, sprites, css) {
	return Q.Promise(function (resolve) {
		css.walkComments(function (comment) {
			var rule, image, backgroundImage, backgroundPosition, backgroundSize;

			// Manipulate only token comments
			if (isToken(comment)) {

				// 通过匹配注释中的路径找到目标的 Rule
				image = _.find(images, {path: comment.text});

				if (image) {
					// Generate correct ref to the sprite
					image.spriteRef = path.relative(image.stylesheetPath, image.spritePath);
					image.spriteRef = image.spriteRef.split(path.sep).join('/');

					backgroundImage = postcss.decl({
						prop: 'background-image',
						value: getBackgroundImageUrl(image),
					});

					backgroundPosition = postcss.decl({
						prop: 'background-position',
						value: getBackgroundPosition(image)
					});

					// Replace the comment and append necessary properties.
					comment.replaceWith(backgroundImage);

					// Output the dimensions
					// 仅当在一倍的情况下才输出 width/height CSS
					rule = backgroundImage.parent;
					if (options.outputDimensions && image.ratio == 1) {
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

/**
 * 设置产生的雪碧图文件名
 *
 */
function makeSpritePath(options, groups) {
	var base = options.spritePath;
	var file = path.resolve(base, groups.join('.') + '.png');
	return file.replace('.@', '@');
}

function mask(toggle) {
	var input = new RegExp('[' + (toggle ? GROUP_DELIMITER : GROUP_MASK) + ']', 'gi');
	var output = toggle ? GROUP_MASK : GROUP_DELIMITER;
	return function (value) {
		return value.replace(input, output);
	};
}

function resolveUrl(image, options) {
	var results;
	if (/^\//.test(image.url)) {
		results = path.resolve(options.imagePath, image.url.replace(/^\//, ''));
	} else {
		results = path.resolve(image.stylesheetPath, image.url);
	}
	// get rid of get params and hash;
	return results.split('#')[0].split('?')[0];
}

/**
 * 正则匹配 @replace 的注释
 *
 */
function isToken(comment) {
	return /@replace/gi.test(comment.toString());
}

/**
 * Return the value for background-image property.
 *
 */
function getBackgroundImageUrl(image) {
	var template = _.template('url(<%= image.spriteRef %>)');
	return template({image: image});
}

/**
 * Return the value for background-position property.
 *
 */
function getBackgroundPosition(image) {
	var x = -1 * (image.ratio > 1 ? image.coordinates.x / image.ratio : image.coordinates.x);
	var y = -1 * (image.ratio > 1 ? image.coordinates.y / image.ratio : image.coordinates.y);
	var template = _.template('<%= (x ? x + "px" : x) %> <%= (y ? y + "px" : y) %>');

	return template({x: x, y: y});
}

/**
 * Return the value for background-size property.
 *
 */
function getBackgroundSize(image) {
	var x = image.properties.width / image.ratio;
	var y = image.properties.height / image.ratio;
	var template = _.template('<%= x %>px <%= y %>px');

	return template({x: x, y: y});
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
	var ratio = _.parseInt(matches[1]);
	return ratio;
}

/**
 * Check whether all images are retina. TODO：必须同时处理含有 1x 与2x 的图片
 *
 */
function areAllRetina(images) {
	return _.every(images, function (image) {
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
function getAtRuleValue(params) {
	var value = params[0];
	value = _.trim(value, "'\"()");
	return value;
}


/**
 * get the images from the special finder.
 *
 */
function getImgList(imageDir, stylesheetPath) {
	var fsReaddir = Q.denodeify(fs.readdir);
	return fsReaddir(imageDir)
		.then(function (files) {
			var promises = files.filter(function (filename) {
				// 需检测为png 图片
				var reg = /\.(png|svg)\b/i;
				return reg.test(filename);
			}).map(function (filename) {
				return Q.Promise(function (resolve, reject) {
					var image = {
						path: null,
						url: null,
						stylesheetPath: stylesheetPath,
						ratio: 1,
						groups: [],
						token: ''
					};
					image.url = filename;

					// log(filename);

					// 获取到所在目录作为合成后的图片名称
					// 获取到最后一个数组 .pop
					image.hash = imageDir.split(path.sep).pop();
					image.groups = [image.hash];
					image.selector = image.hash + '__icon-' + image.url.split('.')[0];

					// retina 图片兼容
					if (isRetinaImage(image.url)) {
						image.ratio = getRetinaRatio(image.url);
						image.selector = image.hash + '__icon-' + image.url.split('@')[0];
					}

					// 获取到图片绝对路径
					image.path = path.resolve(imageDir, filename);
					resolve(image);
				})
			});
			return Q.all(promises);
		})
}
