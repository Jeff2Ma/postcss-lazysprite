const path = require('path')
const fs = require('fs')
const postcss = require('postcss')
const _ = require('lodash')
const spritesmith = require('spritesmith').run
const mkdirp = require('mkdirp')
const md5 = require('spark-md5').hash
const gutil = require('gulp-util')
const revHash = require('rev-hash')
const Promise = require('bluebird')

const space = postcss.list.space;
Promise.promisifyAll(fs)

// @media rule for @2x resolutions
const resolutions2x = [
  'only screen and (-webkit-min-device-pixel-ratio: 2)',
  'only screen and (min--moz-device-pixel-ratio: 2)',
  'only screen and (-o-min-device-pixel-ratio: 2/1)',
  'only screen and (min-device-pixel-ratio: 2)',
  'only screen and (min-resolution: 2dppx)',
  'only screen and (min-resolution: 192dpi)'
];

// @media rule for @3x resolutions. currently only work in some mobile devices
const resolutions3x = [
  'only screen and (-webkit-min-device-pixel-ratio: 3)',
  'only screen and (min-resolution: 3dppx)'
];

const GROUP_DELIMITER = '.';
const GROUP_MASK = '*';

// Cache objects
const cache = {};
const cacheIndex = {};

/* --------------------------------------------------------------
 # Main functions
 -------------------------------------------------------------- */
module.exports = postcss.plugin('postcss-lazysprite', options => {
  // Default Options
  options = options || {}

  options = _.merge({
    cloneRaws: options.cloneRaws || {},
    groupBy: options.groupBy || [],
    padding: options.padding ? options.padding : 10,
    nameSpace: options.nameSpace || '',
    outputDimensions: options.outputDimensions || true,
    outputExtralCSS: options.outputExtralCSS || false,
    smartUpdate: options.smartUpdate || false,
    retinaInfix: options.retinaInfix || '@', // Decide '@2x' or '_2x'
    logLevel: options.logLevel || 'info',  // 'debug','info','slient'
    cssSeparator: options.cssSeparator || '__', // Separator between block and element.
    pseudoClass: options.pseudoClass || false
  }, options)

  // Option `stylesheetPath` is deprecated,
  // so has to give a tip for preview users.
  if (options.stylesheetPath) {
  throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red('Option `stylesheetPath` was deprecated!' +
    ' Please use `stylesheetRelative` to replace.')])
}

// Option `imagePath` is required
if (!options.imagePath) {
  throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red('Option `imagePath` is undefined!' +
    ' Please set it and restart.')])
}

// Option `stylesheetInput` is required
if (!options.stylesheetInput) {
  throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red('Option `stylesheetInput` is undefined!' +
    ' Please set it and restart.')])
}

// Paths
options.imagePath = path.resolve(process.cwd(), options.imagePath || '')
options.spritePath = path.resolve(process.cwd(), options.spritePath || '')

// Group retina images
options.groupBy.unshift(image => {
  if (image.ratio > 1) {
  return `@${image.ratio}x`
}
return null
})

// Processer
return css => extractImages(css, options)
  .spread((images, options) => applyGroupBy(images, options))
.spread((images, options) => setTokens(images, options, css))
.spread((images, options) => runSpriteSmith(images, options))
.spread((images, options, sprites) => saveSprites(images, options, sprites))
.spread((images, options, sprites) => mapSpritesProperties(images, options, sprites))
.spread((images, options, sprites) => updateReferences(images, options, sprites, css))
.catch(err => {
  throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red(err.message)])
})
});

/**
 * Walks the @lazysprite atrule and get the value to extract the target images.
 * @param  {Node}   css
 * @param  {Object} options
 * @return {Promise}
 */
function extractImages (css, options) {
  const images = [];
  let stylesheetRelative = options.stylesheetRelative || path.dirname(css.source.input.file);

  if (!stylesheetRelative) {
    log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red('option `stylesheetRelative` is undefined!')])
  }

  // When the css file is in the second or more depth level directory of destination
  // which relative to `stylesheetRelative`,
  // ref path in css will wrong, so has to be fix it.
  if (css.source.input.file) {
    const stylesheetInputDirRelative = path.relative(options.stylesheetInput, path.dirname(css.source.input.file));
    stylesheetRelative = path.join(stylesheetRelative, stylesheetInputDirRelative)
  }

  // Find @lazysprite string from css
  css.walkAtRules('lazysprite', atRule => {
    // Get the directory of images from atRule value
    const params = space(atRule.params);
  const atRuleValue = getAtRuleValue(params);
  const sliceDir = atRuleValue[0];

  // Get absolute path of directory.
  const imageDir = path.resolve(options.imagePath, sliceDir);

  // Check whether dir exist.
  if (!fs.existsSync(imageDir)) {
    log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red(`No exist "${imageDir}"`)])
    return null
  }

  // Get indent format of the css content.
  const atRuleNext = atRule.parent.nodes;
  const rawNode = _.find(atRuleNext, node => node.type === 'rule');

  // Store the indent format.
  if (rawNode === undefined) {
    options.cloneRaws.between = ''
    options.cloneRaws.after = ''
  } else {
    options.cloneRaws.between = rawNode.raws.between
    options.cloneRaws.after = rawNode.raws.after
  }

  // Foreach the images and set image object.
  const files = fs.readdirSync(imageDir);
  _.forEach(files, filename => {
    // Have to be png file
    const reg = /\.(png)\b/i;
  if (!reg.test(filename)) {
    return null
  }

  const image = {
    path: null, // Absolute path
    name: null, // Filename
    stylesheetRelative,
    ratio: 1,
    groups: [],
    token: ''
  };

  image.name = filename

  // Set the directory name as sprite file name,
  // .pop() to get the last element in array
  image.dir = imageDir.split(path.sep).pop()
  image.groups = [image.dir]
  image.selector = setSelector(image, options, atRuleValue[1])

  // Get absolute path of image
  image.path = path.resolve(imageDir, filename)

  // For retina
  if (isRetinaImage(image.name)) {
    image.ratio = getRetinaRatio(image.name)
    image.selector = setSelector(image, options, atRuleValue[1], true)
  }

  // Push image obj to array.
  images.push(image)
})
})

  return Promise.resolve([images, options])
}

/**
 * Apply groupBy functions over collection of exported images.
 * @param  {Object} options
 * @param  {Array}  images
 * @return {Promise}
 */
function applyGroupBy (images, options) {
  return Promise.reduce(options.groupBy, (images, group) => Promise.map(images, image => Promise.resolve(group(image)).then(group => {
    if (group) {
      image.groups.push(group)
    }
    return image
  }).catch(image => image)), images).then(images => [images, options])
}

/**
 * Set the necessary tokens info to the background declarations.
 * @param  {Node}   css
 * @param  {Object} options
 * @param  {Array}  images
 * @return {Promise}
 */
function setTokens (images, options, css) {
  return new Promise(resolve => {
    css.walkAtRules('lazysprite', atRule => {
    // Get the directory of images from atRule value
    const params = space(atRule.params);
  const atRuleValue = getAtRuleValue(params);
  const sliceDir = atRuleValue[0];
  const sliceDirname = sliceDir.split(path.sep).pop();
  const atRuleParent = atRule.parent;
  const mediaAtRule2x = postcss.atRule({name: 'media', params: resolutions2x.join(', ')});
  const mediaAtRule3x = postcss.atRule({name: 'media', params: resolutions3x.join(', ')});

  // Tag flag
  let has2x = false;
  let has3x = false;

  if (options.outputExtralCSS) {
    const outputExtralCSSRule = postcss.rule({
      selector: `.${options.nameSpace}${atRuleValue[1] ? atRuleValue[1] : sliceDirname}`,
      source: atRule.source
    });

    outputExtralCSSRule.append({prop: 'display', value: 'inline-block'})
    outputExtralCSSRule.append({prop: 'overflow', value: 'hidden'})
    outputExtralCSSRule.append({prop: 'font-size', value: '0'})
    outputExtralCSSRule.append({prop: 'line-height', value: '0'})
    atRule.before(outputExtralCSSRule)
  }

  // Foreach every image object
  _.forEach(images, image => {
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
    })

    // Add `source` argument for source map create.
    const singleRule = postcss.rule({
      selector: `.${options.nameSpace}${image.selector}`,
      source: atRule.source
    });

    singleRule.append(image.token)

    switch (image.ratio) {
      // @1x
      case 1:
        atRuleParent.insertBefore(atRule, singleRule)
        break
      // @2x
      case 2:
        mediaAtRule2x.append(singleRule)
        has2x = true
        break
      // @3x
      case 3:
        mediaAtRule3x.append(singleRule)
        has3x = true
        break
      default:
        break
    }
  }
})

  // @2x @3x media rule are last.
  if (has2x) {
    atRuleParent.insertBefore(atRule, mediaAtRule2x)
  }
  if (has3x) {
    atRuleParent.insertBefore(atRule, mediaAtRule3x)
  }

  atRule.remove()
})
  resolve([images, options])
})
}

/**
 * Use spritesmith module to process images.
 * @param  {Object} options
 * @param  {Array}  images
 * @return {Promise}
 */
function runSpriteSmith (images, options) {
  return new Promise((resolve, reject) => {
    const all = _
      .chain(images)
      .groupBy(image => {
      let temp;

  temp = image.groups.map(mask(true))
  temp.unshift('_')

  return temp.join(GROUP_DELIMITER)
})
.map((images, temp) => {
    const config = _.merge({}, options, {
      src: _.map(images, 'path')
    });
  let ratio;

  // Enlarge padding when are retina images
  if (areAllRetina(images)) {
    ratio = _
      .chain(images)
      .flatMap('ratio')
      .uniq()
      .value()

    if (ratio.length === 1) {
      config.padding *= ratio[0]
    }
  }

  let checkString = [];

  _.each(config.src, image => {
    const checkBuffer = fs.readFileSync(image);
  const checkHash = revHash(checkBuffer);
  checkString.push(checkHash)
})

  // Get the group files hash so that next step can SmartUpdate.
  checkString = md5(_.sortBy(checkString).join('&'))
  config.groupHash = checkString.slice(0, 10)

  // Collect images datechanged
  config.spriteName = temp.replace(/^_./, '').replace(/.@/, '@')

  // Get data from cache (avoid spritesmith)
  if (cache[checkString]) {
    const deferred = Promise.pending();
    const results = cache[checkString];
    results.isFromCache = true
    deferred.resolve(results)
    return deferred.promise
  }

  return Promise.promisify(spritesmith)(config)
    .then(result => {
    temp = temp.split(GROUP_DELIMITER)
    temp.shift()

  // Append info about sprite group
  result.groups = temp.map(mask(false))

  // Pass the group file hash for next `saveSprites` function.
  result.groupHash = config.groupHash

  // Cache - clean old
  const oldCheckString = cacheIndex[config.spriteName];
  if (oldCheckString && cache[oldCheckString]) {
    delete cache[oldCheckString]
  }

  // Cache - add brand new data
  cacheIndex[config.spriteName] = checkString
  cache[checkString] = result

  return result
})
})
.value();

  Promise.all(all)
    .then(results => {
    resolve([images, options, results])
  })
.catch(err => {
    if (err) {
      reject(err)
    }
  })
})
}

/**
 * Save the sprites to the target path.
 * @param  {Object} options
 * @param  {Array}  images
 * @param  {Array}  sprites
 * @return {Promise}
 */
function saveSprites (images, options, sprites) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(options.spritePath)) {
    mkdirp.sync(options.spritePath)
  }

  const all = _
    .chain(sprites)
    .map(sprite => {
    sprite.path = makeSpritePath(options, sprite.groups, sprite.groupHash)
  const deferred = Promise.pending();

  // If this file is up to date
  if (sprite.isFromCache) {
    log(options.logLevel, 'lv3', ['Lazysprite:', gutil.colors.yellow(path.relative(process.cwd(), sprite.path)), 'unchanged.'])
    deferred.resolve(sprite)
    return deferred.promise
  }

  // If this sprites image file is exist. Only work when option `smartUpdate` is true.
  if (options.smartUpdate) {
    sprite.filename = `${sprite.groups.join('.')}.${sprite.groupHash}.png`
    sprite.filename = sprite.filename.replace('.@', '@')
    if (fs.existsSync(sprite.path)) {
      log(options.logLevel, 'lv3', ['Lazysprite:', gutil.colors.yellow(path.relative(process.cwd(), sprite.path)), 'already existed.'])
      deferred.resolve(sprite)
      return deferred.promise
    }

    // After the above steps, new sprite file was created,
    // Old sprite file has to be deleted.
    let oldSprites = fs.readdirSync(options.spritePath);

    // If it is not retina sprite,
    // The single one of sprite should the same.
    if (!isRetinaHashImage(sprite.path)) {
      oldSprites = _.filter(oldSprites, oldSprite => !isRetinaHashImage(oldSprite))
    }

    const spriteGroup = sprite.groups.join('.');
    const spriteForIndex = spriteGroup.replace('.@', options.retinaInfix);

    // Delete old files.
    _.forEach(oldSprites, filename => {
      const fullname = path.join(options.spritePath, filename);
    if (fs.statSync(fullname) && (fullname.includes(spriteForIndex))) {
      fs.unlink(path.join(options.spritePath, filename), err => {
        if (err) {
          return console.error(err)
        }
        log(options.logLevel, 'lv2', ['Lazysprite:', gutil.colors.red(path.relative(process.cwd(), path.join(options.spritePath, filename))), 'deleted.'])
    })
    }
  })
  }

  // Save new file version
  return fs.writeFileAsync(sprite.path, new Buffer(sprite.image, 'binary'))
    .then(() => {
    log(options.logLevel, 'lv2', ['Lazysprite:', gutil.colors.green(path.relative(process.cwd(), sprite.path)), 'generated.'])
  return sprite
})
})
.value();

  Promise.all(all)
    .then(sprites => {
    resolve([images, options, sprites])
  })
.catch(err => {
    if (err) {
      reject(err)
    }
  })
})
}

/**
 * Map sprites props for every image.
 * @param  {Object} options
 * @param  {Array}  images
 * @param  {Array}  sprites
 * @return {Promise}
 */
function mapSpritesProperties (images, options, sprites) {
  return new Promise(resolve => {
    sprites = _.map(sprites, sprite => _.map(sprite.coordinates, (coordinates, imagePath) => _.merge(_.find(images, {path: imagePath}), {
      coordinates,
      spritePath: sprite.path,
      properties: sprite.properties
    })))
  resolve([images, options, sprites])
})
}

/**
 * Updates the CSS references from the token info.
 * @param  {Node}   css
 * @param  {Object} options
 * @param  {Array}  images
 * @param  {Array}  sprites
 * @return {Promise}
 */
function updateReferences (images, options, sprites, css) {
  return new Promise(resolve => {
    css.walkComments(comment => {
    let rule;
  let image;
  let backgroundImage;
  let backgroundPosition;
  let backgroundSize;
  // Manipulate only token comments
  if (isToken(comment)) {
    // Match from the path with the tokens comments
    image = _.find(images, {path: comment.text})
    if (image) {
      // 2x check even dimensions.
      if (image.ratio === 2 && (image.coordinates.width % 2 !== 0 || image.coordinates.height % 2 !== 0)) {
        throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red(path.relative(process.cwd(), image.path)), '`2x` image should have' +
        ' even dimensions.'])
      }

      // 3x check dimensions.
      if (image.ratio === 3 && (image.coordinates.width % 3 !== 0 || image.coordinates.height % 3 !== 0)) {
        throw log(options.logLevel, 'lv1', ['Lazysprite:', gutil.colors.red(path.relative(process.cwd(), image.path)), '`3x` image should have' +
        ' correct dimensions.'])
      }

      // Generate correct ref to the sprite
      image.spriteRef = path.relative(image.stylesheetRelative, image.spritePath)
      image.spriteRef = image.spriteRef.split(path.sep).join('/')

      backgroundImage = postcss.decl({
        prop: 'background-image',
        value: getBackgroundImageUrl(image)
      })

      backgroundPosition = postcss.decl({
        prop: 'background-position',
        value: getBackgroundPosition(image)
      })

      // Replace the comment and append necessary properties.
      comment.replaceWith(backgroundImage)

      // Output the dimensions (only with 1x)
      if (options.outputDimensions && image.ratio === 1) {
        ['height', 'width'].forEach(prop => {
          backgroundImage.after(
          postcss.decl({
            prop,
            value: `${image.ratio > 1 ? image.coordinates[prop] / image.ratio : image.coordinates[prop]}px`
          })
        )
      })
      }

      backgroundImage.after(backgroundPosition)

      if (image.ratio > 1) {
        backgroundSize = postcss.decl({
          prop: 'background-size',
          value: getBackgroundSize(image)
        })

        backgroundPosition.after(backgroundSize)
      }
    }
  }
})

  resolve([images, options, sprites, css])
})
}

/* --------------------------------------------------------------
 # Helpers
 -------------------------------------------------------------- */

// Get the value of Atrule and trim to string without quote.
function getAtRuleValue (params) {
  let value = params[0];
  const array = [];
  value = _.trim(value, '\'"()')
  if (value.includes('#')) {
    value = value.split('#')
    return value
  }
  array.push(value)
  return array
}

// Set the class name.
// Also deal with retina, `:hover` css class contexts.
function setSelector(image, options, dynamicBlock=false, retina=false) {
  let basename = path.basename(image.name, '.png');
  if (retina) {
    // If retina, then '@2x','@3x','_2x','_3x' will be removed.
    basename = _.replace(basename, /[@_](\d)x$/, '')
  }
  let selector = (dynamicBlock ? dynamicBlock : image.dir) + options.cssSeparator + basename;
  if (options.pseudoClass) {
    if (image.name.toLowerCase().includes('hover') || image.name.toLowerCase().includes('active')) {
      selector = _.replace(selector, 'Hover', ':hover')
      selector = _.replace(selector, 'Active', ':active')
      selector = _.replace(selector, '_hover', ':hover')
      selector = _.replace(selector, '_active', ':active')
    }
  }
  return selector
}

// Set the sprite file name form groups.
function makeSpritePath (options, groups, groupHash) {
  const base = options.spritePath;
  let file;
  if (options.smartUpdate) {
    file = path.resolve(base, `${groups.join('.')}.${groupHash}.png`)
  } else {
    file = path.resolve(base, `${groups.join('.')}.png`)
  }
  return file.replace('.@', options.retinaInfix)
}

// Mask function
function mask (toggle) {
  const input = new RegExp(`[${toggle ? GROUP_DELIMITER : GROUP_MASK}]`, 'gi');
  const output = toggle ? GROUP_MASK : GROUP_DELIMITER;
  return value => value.replace(input, output)
}

// RegExp to match `@replace` comments
function isToken (comment) {
  return /@replace/gi.test(comment.toString())
}

// Return the value for background-image property
function getBackgroundImageUrl (image) {
  const template = _.template('url(<%= image.spriteRef %>)');
  return template({image})
}

// Return the value for background-position property
function getBackgroundPosition (image) {
  const x = -1 * (image.ratio > 1 ? image.coordinates.x / image.ratio : image.coordinates.x);
  const y = -1 * (image.ratio > 1 ? image.coordinates.y / image.ratio : image.coordinates.y);
  const template = _.template('<%= (x ? x + "px" : x) %> <%= (y ? y + "px" : y) %>');
  return template({x, y})
}

// Return the pencentage value for background-position property
function getBackgroundPositionInPercent (image) {
  const x = 100 * (image.coordinates.x) / (image.properties.width - image.coordinates.width);
  const y = 100 * (image.coordinates.y) / (image.properties.height - image.coordinates.height);
  const template = _.template('<%= (x ? x + "%" : x) %> <%= (y ? y + "%" : y) %>');
  return template({x, y})
}

// Return the value for background-size property.
function getBackgroundSize (image) {
  const x = image.properties.width / image.ratio;
  const y = image.properties.height / image.ratio;
  const template = _.template('<%= x %>px <%= y %>px');

  return template({x, y})
}

// Check whether is '.png' file.
function isPNG (url) {
  return /.png$/gi.test(url)
}

// Check whether the image is retina,
// Both `@2x` and `_2x` are support.
function isRetinaImage (url) {
  return /[@_](\d)x\.[a-z]{3,4}$/gi.test(url)
}

// Check whether the image is retina,
// work with hashed naming filename,
// eg. `@2x.578cc898ef.png`, `_3x.bc11f5103f.png`
function isRetinaHashImage (url) {
  return /[@_](\d)x\.[a-z0-9]{6,10}\.[a-z]{3,4}$/gi.test(url)
}

// Return the value of retina ratio.
function getRetinaRatio (url) {
  const matches = /[@_](\d)x\.[a-z]{3,4}$/gi.exec(url);
  if (!matches) {
    return 1
  }
  const ratio = _.parseInt(matches[1]);
  return ratio
}

// Get retina infix from file name
function getRetinaInfix (name) {
  const matches = /([@_])[0-9]x\.[a-z]{3,4}$/gi.exec(name);
  if (!matches) {
    return '@'
  }
  return matches[1]
}

// Check whether all images are retina. should both with 1x and 2x
function areAllRetina (images) {
  return _.every(images, image => image.ratio > 1)
}

// Log with same stylesheet and level control.
function log (logLevel, level, content) {
  let output = true;

  switch (logLevel) {
    case 'slient':
      if (level !== 'lv1') {
        output = false
      }
      break
    case 'info':
      if (level === 'lv3') {
        output = false
      }
      break
    default:
      output = true
  }
  if (output) {
    const data = Array.prototype.slice.call(content);
    gutil.log.apply(false, data)
  }
}

// Log for debug
function debug () {
  const data = Array.prototype.slice.call(arguments);
  gutil.log.apply(false, data)
}
