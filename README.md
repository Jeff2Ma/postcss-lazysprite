# postcss-lazysprite

> This plugin is still in developing.

<img align="right" width="130" height="130" title="PostCSS" src="http://postcss.github.io/postcss/logo.svg">

[![Build Status](https://travis-ci.org/Jeff2Ma/postcss-lazysprite.svg?branch=master)](https://travis-ci.org/Jeff2Ma/postcss-lazysprite)
[![npm version](https://badge.fury.io/js/postcss-lazysprite.svg)](http://badge.fury.io/js/postcss-lazysprite)
[![lic-image](https://img.shields.io/npm/l/postcss-lazysprite.svg)](https://github.com/Jeff2Ma/postcss-lazysprite/blob/master/LICENSE.md)
[![change-log](https://img.shields.io/badge/changelog-md-blue.svg)](https://github.com/Jeff2Ma/postcss-lazysprite/blob/master/CHANGELOG.md)

A [PostCSS](https://github.com/postcss/postcss) plugin that generates sprites form the directory of images automatically.

Another lazy way to generate sprites and proper CSS with retina support. Feel free to use it :)

## Function


### Input

```CSS
/* ./src/css/index.css */
@lazysprite "./file";
```

### Output

```CSS
/* ./dist/css/index.css */
.filetype__icon-doc {
    background-image: url(../sprites/filetype.png);
    background-position: 0 0;
    width: 80px;
    height: 80px;
}

.filetype__icon-pdf {
    background-image: url(../sprites/filetype.png);
    background-position: -90px 0;
    width: 80px;
    height: 80px;
}

@media only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (min--moz-device-pixel-ratio:2), only screen and (-o-min-device-pixel-ratio:2/1), only screen and (min-device-pixel-ratio:2), only screen and (min-resolution:2dppx), only screen and (min-resolution:192dpi) {
    .filetype__icon-doc {
        background-image: url(../sprites/filetype@2x.png);
        background-position: 0 0;
        background-size: 170px 170px;
    }

    .filetype__icon-pdf {
        background-image: url(../sprites/filetype@2x.png);
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
        └── file
            ├── doc.png
            ├── doc@2x.png
            ├── pdf.png
            └── pdf@2x.png
```

## Features

- Simple and easy, just need to put your images to the special folder.

- Retina support (`@2x`, `@3x`, `_2x`, `_3x` are all available).

- Fully work well with Source Map.

- Cache way and good perfomance to run faster.

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
			nameSpace: 'icon-',
			outputDimensions: true
		})]))
		.pipe(gulp.dest('./test/dist/css'));
});
```

## Options

#### imagePath

> Relative path to the folder that sprite images are stored. For resolving absolute images. This option also as the base/* relative to stylesheets/ according to `from` option above */ path to the value of `@lazysprite`.

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

#### nameSpace

> NameSpace(Prefix) of the class name of each image. The `className` = `nameSpace` + `fileName`.

- Default: `''`
- Required: `false`

#### outputDimensions

> Deside whether output `width` & `height` properties.

- Default: `true`
- Required: `false`


## Contributing

Thanks the inspirations from [postcss-easysprites](https://github.com/glebmachine/postcss-easysprites) plugin.

[Issues](https://github.com/Jeff2Ma/postcss-lazysprite/issues) and [Pull requests](https://github.com/Jeff2Ma/postcss-lazysprite/pulls) are welcome.

```bash
$ git clone https://github.com/Jeff2Ma/postcss-lazysprite
$ cd postcss-lazysprite
$ npm i
$ gulp
```