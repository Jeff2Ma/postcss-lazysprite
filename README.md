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
.icon-filetype__excel {
	background-image: url(../sprites/filetype.png);
	background-position: 0 0;
	width: 32px;
	height: 32px;
}
.icon-filetype__pdf {
	background-image: url(../sprites/filetype.svg);
	background-position: 0 0;
	width: 32px;
	height: 32px;
}
.icon-filetype__ppt {
	background-image: url(../sprites/filetype.png);
	background-position: -32px 0;
	width: 32px;
	height: 32px;
}
.icon-filetype__word {
	background-image: url(../sprites/filetype.svg);
	background-position: -32px 0;
	width: 32px;
	height: 32px;
}

@media only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (min--moz-device-pixel-ratio:2), only screen and (-o-min-device-pixel-ratio:2/1), only screen and (min-device-pixel-ratio:2), only screen and (min-resolution:2dppx), only screen and (min-resolution:192dpi) {
	.icon-filetype__excel {
		background-image: url(../sprites/filetype@2x.png);
		background-position: 0 0;
		background-size: 64px 32px;
	}
	.icon-filetype__ppt {
		background-image: url(../sprites/filetype@2x.png);
		background-position: -32px 0;
		background-size: 64px 32px;
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

More examples with different options: [nameSpace](./examples/nameSpace.md), [outputDimensions](./examples/outputDimensions.md), [dynamicClassBlock](./examples/dynamicClassBlock.md), [pseudoClass](./examples/pseudoClass.md)

## Features

- Simple and easy, just need to put your images to the special folder.

- Retina support (`@2x`, `@3x`, `_2x`, `_3x` are all available).

- Support SVG Sprites.

- Fully work well with Source Map.

- Cache way and good perfomance to run faster.

- Support sprites with`:hover`、`:active` condition([example](./examples/pseudoClass.md)).

## User

[WeChat for Work](https://work.weixin.qq.com) and [Wechat Reader](https://weread.qq.com) are using `postcss-lazysprite` in production.

<a href="https://work.weixin.qq.com"><img width="104" height="32" title="WeChat for Work" src="./examples/src/slice/logo/WeWork@2x.png" alt="WeChat for Work"></a>

<a href="https://weread.qq.com"><img width="104" height="32" title="Wechat Reader" src="./examples/src/slice/logo/WeRead@2x.png" alt="Wechat Reader"></a>


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
	return gulp.src('./test/src/css/**/*.css')
		.pipe(postcss([lazysprite({
			imagePath:'./test/src/slice',
			stylesheetInput: './test/src/css',
			stylesheetRelative: './test/dist/css',
			spritePath: './test/dist/slice',
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


#### stylesheetInput

> The directory that store css(or scss/less) source files. If you are use gulp.js, simply the value of `gulp.src` without the part of `**` and so on.

- Default: null
- Required: `true`

#### stylesheetRelative

> Relative path to the folder that will keep your output stylesheet(s). If it's null the path of CSS file will be used.

- Default: null
- Required: `false`

#### spritePath

> Relative path to the folder that will keep your output spritesheet(s).

- Default: `./`
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

#### retinaInfix

> Deside the created sprite retina file is whether '@2x' or '_2x' as part of name.

- Default: `@`
- Required: `false`

#### outputExtralCSS

> Deside whether output extral css details, which list like:

```css
.icon-filetype {
    display: inline-block;
    overflow: hidden;
    font-size: 0;
    line-height: 0;
}
```

when set this option as `true`, the html sould like:

```html
<i class="icon-filetype icon-filetype__doc"></i>
```

- Default: `false`
- Required: `false`

#### pseudoClass

> If the file naming with `Hover`or `Active` as suffix，it will turn to   the `:hover` or `:active` pseudo class.([example](./examples/pseudoClass.md))

- Default: `false`
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
