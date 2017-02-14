# postcss-lazysprite Examples

*******

## Option `nameSpace`

### Config

```javascript
options = {
    imagePath:'./test/src/slice',
    stylesheetPath: './test/dist/css',
    spritePath: './test/dist/slice',
    nameSpace: 'ww-'
};
```
### Input

```css
/* ./src/css/index.css */
@lazysprite "filetype";
```

### Output

```css
/* ./dist/css/index.css */
.ww-filetype__icon-doc {
    background-image: url(../sprites/filetype.png);
    background-position: 0 0;
    width: 80px;
    height: 80px;
}

.ww-filetype__icon-pdf {
    background-image: url(../sprites/filetype.png);
    background-position: -90px 0;
    width: 80px;
    height: 80px;
}

@media only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (min--moz-device-pixel-ratio:2), only screen and (-o-min-device-pixel-ratio:2/1), only screen and (min-device-pixel-ratio:2), only screen and (min-resolution:2dppx), only screen and (min-resolution:192dpi) {
    .ww-filetype__icon-doc {
        background-image: url(../sprites/filetype@2x.png);
        background-position: 0 0;
        background-size: 170px 170px;
    }

    .ww-filetype__icon-pdf {
        background-image: url(../sprites/filetype@2x.png);
        background-position: -90px 0;
        background-size: 170px 170px;
    }
}
```