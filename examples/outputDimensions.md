# postcss-lazysprite Examples

*******

## Option `outputDimensions`

### Config

```javascript
options = {
    imagePath:'./test/src/slice',
    stylesheetPath: './test/dist/css',
    spritePath: './test/dist/slice',
    nameSpace:'icon-',
    smartUpdate: false,
    outputDimensions: false
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
.icon-filetype__doc {
    background-image: url(../sprites/filetype.png);
    background-position: 0 0;
}

.icon-filetype__pdf {
    background-image: url(../sprites/filetype.png);
    background-position: -90px 0;
}

@media only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (min--moz-device-pixel-ratio:2), only screen and (-o-min-device-pixel-ratio:2/1), only screen and (min-device-pixel-ratio:2), only screen and (min-resolution:2dppx), only screen and (min-resolution:192dpi) {
    .icon-filetype__doc {
        background-image: url(../sprites/filetype@2x.png);
        background-position: 0 0;
        background-size: 170px 170px;
    }

    .icon-filetype__pdf {
        background-image: url(../sprites/filetype@2x.png);
        background-position: -90px 0;
        background-size: 170px 170px;
    }
}
```
