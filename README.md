# postcss-lazysprite

A PostCSS plugin that generates sprites form the directory of images automatically.

Another lazy way to generate sprites and proper CSS with retina support. Feel free to use it :)

## Function

### Files tree

```
.
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



