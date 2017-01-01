# postcss-lazysprite

<img align="right" width="130" height="130" title="PostCSS" src="http://postcss.github.io/postcss/logo.svg">

[![Build Status](https://travis-ci.org/Jeff2Ma/postcss-lazysprite.svg?branch=master)](https://travis-ci.org/Jeff2Ma/postcss-lazysprite)
[![npm version](https://badge.fury.io/js/postcss-lazysprite.svg)](http://badge.fury.io/js/postcss-lazysprite)

A [PostCSS](https://github.com/postcss/postcss) plugin that generates sprites form the directory of images automatically.

Another lazy way to generate sprites and proper CSS with retina support. Feel free to use it :)

## Function

### Files tree

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

### Input
```CSS
/* ./src/css/index.css */
@lazysprite "./file";
```

### Output

```CSS
/* ./dist/css/index.css */
.icon-doc{ 
	background-image: url(../../dist/slice/file.png); 
	background-position: 0 0; 
	width: 80px; 
	height: 80px;
}

.icon-pdf{ 
	background-image: url(../../dist/slice/file.png); 
	background-position: -90px 0; 
	width: 80px; 
	height: 80px;
}

@media (min--moz-device-pixel-ratio: 1.5), (-o-min-device-pixel-ratio: 3/2), (-webkit-min-device-pixel-ratio: 1.5), (min-device-pixel-ratio: 1.5), (min-resolution: 144dpi), (min-resolution: 1.5dppx){
	.icon-doc{ 
		background-image: url(../../dist/slice/file@2x.png); 
		background-position: 0 0; 
		background-size: 170px 170px;
		width: 80px; 
		height: 80px;
	}

	.icon-pdf{ 
		background-image: url(../../dist/slice/file@2x.png); 
		background-position: -90px 0; 
		background-size: 170px 170px; 
		width: 80px; 
		height: 80px;
	}
}
```

## Features

- Simple and easy, just need to put your all images to the special folder.

- Retina support.

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
			spritePath: './test/dist/slice',
			outputDimensions: true
		})]))
		.pipe(gulp.dest('./test/dist/css'));
});
```

## Options

#### imagePath

> Relative path to the folder that sprite images are stored. For resolving absolute images

- Default: null
- Required: `true`

#### stylesheetPath

> Relative path to the folder that will keep your output stylesheet(s). If it's null the path of CSS file will be used.

- Default: null
- Required: `false`

#### spritePath

> Relative path to the folder that will keep your output spritesheet(s).

- Default: `./`
- Required: `true`

## Contributing

Issues and Pull requests are welcome.

```bash
$ git clone https://github.com/Jeff2Ma/postcss-lazysprite
$ cd postcss-lazysprite
$ npm i
$ gulp
```


