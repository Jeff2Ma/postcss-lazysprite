# postcss-lazysprite

<img align="right" width="130" height="130" title="PostCSS" src="http://postcss.github.io/postcss/logo.svg">

[![Build Status](https://travis-ci.org/Jeff2Ma/postcss-lazysprite.svg?branch=master)](https://travis-ci.org/Jeff2Ma/postcss-lazysprite)
[![Windows Build Status](https://ci.appveyor.com/api/projects/status/github/Jeff2Ma/postcss-lazysprite?branch=master&svg=true)](https://ci.appveyor.com/project/Jeff2Ma/postcss-lazysprite)
[![npm version](https://badge.fury.io/js/postcss-lazysprite.svg)](https://www.npmjs.com/package/postcss-lazysprite)
[![change-log](https://img.shields.io/badge/changelog-md-blue.svg)](https://github.com/Jeff2Ma/postcss-lazysprite/blob/master/CHANGELOG.md)

A [PostCSS](https://github.com/postcss/postcss) plugin that generates sprites from the directory of images automatically.

A lazy way to generate sprites and proper CSS with retina support. Feel free to use it :)

## Example

### Input

```CSS
/* ./src/css/index.css */
@lazysprite "filetype";
```

### Output

```CSS
/* ./dist/css/index.css */
.icon-filetype-doc {
    background-image: url(../sprites/filetype.3f1f178013.png);
    background-position: 0 0;
    width: 80px;
    height: 80px;
}

.icon-filetype-pdf {
    background-image: url(../sprites/filetype.3f1f178013.png);
    background-position: -90px 0;
    width: 80px;
    height: 80px;
}

@media only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (min--moz-device-pixel-ratio:2), only screen and (-o-min-device-pixel-ratio:2/1), only screen and (min-device-pixel-ratio:2), only screen and (min-resolution:2dppx), only screen and (min-resolution:192dpi) {
    .icon-filetype-doc {
        background-image: url(../sprites/filetype@2x.cbed5ca6a9.png);
        background-position: 0 0;
        background-size: 170px 170px;
    }

    .icon-filetype-pdf {
        background-image: url(../sprites/filetype@2x.cbed5ca6a9.png);
        background-position: -90px 0;
        background-size: 170px 170px;
    }
}
```

### File tree

> Just a example for above output result, you can dynamic yourself with options.

```
.
├── gulpfile.js
├── dist
└── src
    ├── css
    │   └── index.css
    ├── html
    │   └── index.html
    └── slice
        └── filetype
            ├── doc.png
            ├── doc@2x.png
            ├── pdf.png
            └── pdf@2x.png
```

More examples with different options: [smartUpdate](./examples/smartUpdate.md), [nameSpace](./examples/nameSpace.md), [outputDimensions](./examples/outputDimensions.md), [dynamicClassBlock](./examples/dynamicClassBlock.md)

## Features

- Simple and easy, just need to put your images to the special folder.

- Retina support (`@2x`, `@3x`, `_2x`, `_3x` are all available).

- Fully work well with Source Map.

- Cache way and good perfomance to run faster.

- Support sprites with`:hover` condition([example](./examples/hover.md)).

## Installation

```bash
npm install postcss-lazysprite --save-dev
```

## Usage

Work with [Gulp](http://gulpjs.com/)

Example:

```javascript
var gulp = require('gulp');
var postcss = require('gulp-postcss');
var lazysprite = require('postcss-lazysprite');

gulp.task('css', function () {
	return gulp.src('./test/src/css/*.css')
		.pipe(postcss([lazysprite({
			imagePath:'./test/src/slice',
			stylesheetPath: './test/dist/css',
			spritePath: './test/dist/slice',
			smartUpdate: true,
			nameSpace: 'icon-'
		})]))
		.pipe(gulp.dest('./test/dist/css'));
});
```

## Options

#### imagePath

> Relative path to the folder that sprite images are stored. For resolving absolute images. This option also as the base relative to the value of `@lazysprite` which is what you output.

- Default: null
- Required: `true`

#### stylesheetPath

> Relative path to the folder that will keep your output stylesheet(s). If it's null the path of CSS file will be used.

- Default: null
- Required: `false`

#### spritePath

> Relative path to the folder that will keep your output spritesheet(s).

- Default: `./`
- Required: `false`

#### smartUpdate

> Deside whether run `smartUpdate` mod.`smartUpdate` mod can create a hash for sprites files revving so that it can be updated when it is real need (like [compass spriting](http://compass-style.org/help/tutorials/spriting/) ). It is suggested to open so that to make sprites with hight performance. 

- Default: `false`
- Required: `false`

#### nameSpace

> NameSpace(Prefix) of the class name of each image.

- Default: null
- Required: `false`

#### logLevel

> Deside which level to output log. Can be either "debug", "info", or "silent".
 
```javascript
// Show me additional info about the process
logLevel: "debug"

// Just show basic info
logLevel: "info"

// output NOTHING except alert
logLevel: "silent"
```

- Default: `info`
- Required: `false`

#### cssSeparator

> Separator between css selector's 'block' and 'element'. In this plugin. 'block' is equal to file dirname or dynamic one, 'element' is the base name of file.

- Default: `'__'`
- Required: `false`

#### outputDimensions

> Deside whether output `width` & `height` properties.

- Default: `true`
- Required: `false`


## Contributing

Thanks the inspirations from [postcss-sprites](https://github.com/2createStudio/postcss-sprites) plugin.

[Issues](https://github.com/Jeff2Ma/postcss-lazysprite/issues) and [Pull requests](https://github.com/Jeff2Ma/postcss-lazysprite/pulls) are welcome.

```bash
$ git clone https://github.com/Jeff2Ma/postcss-lazysprite
$ cd postcss-lazysprite
$ npm i
$ gulp # for dev
$ gulp test # for test
```
