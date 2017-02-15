# postcss-lazysprite Examples

*******

## `:hover` support.

### Config

special config is not needed.

### File tree

```
.
├── gulpfile.js
├── dist
└── src
    ├── css
    │   └── index.css
    ├── html
    │   └── index.html
    └── slice
        └── center
            ├── wechat.png
            ├── wechat@2x.png
            ├── wechatHover.png
            └── wechatHover@2x.png
```
### Input

```css
/* ./src/css/index.css */
@lazysprite "center";
```

### Output

```css
/* ./dist/css/index.css */
.center__wechat {
    background-image: url(../sprites/center.png);
    background-position: -70px 0;
    width: 25px;
    height: 25px;
}

.center__wechat:hover {
    background-image: url(../sprites/center.png);
    background-position: -70px -35px;
    width: 25px;
    height: 25px;
}

@media only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (min--moz-device-pixel-ratio:2), only screen and (-o-min-device-pixel-ratio:2/1), only screen and (min-device-pixel-ratio:2), only screen and (min-resolution:2dppx), only screen and (min-resolution:192dpi) {
    .center__wechat {
        background-image: url(../sprites/center@2x.png);
        background-position: -70px 0;
        background-size: 95px 60px;
    }

    .center__wechat:hover {
        background-image: url(../sprites/center@2x.png);
        background-position: -70px -35px;
        background-size: 95px 60px;
    }
}
```
