# postcss-lazysprite Examples

*******

## Option `dynamicClassBlock`

>In the created class name (selector), the default 'block' in class(like BEM method) is the same as directory name (which also the `@lazysprite` atrule value). But you can dynamic it, just need to add `#new-class-block` to the `@lazysprite` atrule value.
>

### Config

```javascript
options = {
    imagePath:'./test/src/slice',
    stylesheetPath: './test/dist/css',
    spritePath: './test/dist/slice',
    smartUpdate: false
};
```
### Input

```css
/* ./src/css/index.css */
@lazysprite "filetype#my-diy-file";
```

### Output

```css
/* ./dist/css/index.css */
/* if not dynamic to `#my-diy-file`, it will be `.filetype__doc` */
.my-diy-file__doc {
    background-image: url(../sprites/filetype.png);
    background-position: 0 0;
    width: 80px;
    height: 80px;
}

.my-diy-file__pdf {
    background-image: url(../sprites/filetype.png);
    background-position: -90px 0;
    width: 80px;
    height: 80px;
}

@media only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (min--moz-device-pixel-ratio:2), only screen and (-o-min-device-pixel-ratio:2/1), only screen and (min-device-pixel-ratio:2), only screen and (min-resolution:2dppx), only screen and (min-resolution:192dpi) {
    .my-diy-filee__doc {
        background-image: url(../sprites/filetype@2x.png);
        background-position: 0 0;
        background-size: 170px 170px;
    }

    .my-diy-file__pdf {
        background-image: url(../sprites/filetype@2x.png);
        background-position: -90px 0;
        background-size: 170px 170px;
    }
}
```
