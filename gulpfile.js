var gulp = require('gulp');
var postcss = require('gulp-postcss');
var lazysprite = require('./index.js');
var mocha = require('gulp-mocha');
var sourcemaps = require('gulp-sourcemaps');
var perfectionist = require('perfectionist');

var files = ['index.js'];
var watchFiles = ['index.js', 'gulpfile.js', 'demo/src/**/**'];

gulp.task('lint', function () {
	var eslint = require('gulp-eslint');
	return gulp.src(files)
		.pipe(eslint())
		.pipe(eslint.format())
		.pipe(eslint.failAfterError());
});

gulp.task('demo', function () {
	return gulp.src('demo/*.js', {read: false})
		.pipe(mocha({timeout: 1000000}));
});

gulp.task('htmlcopy', function () {
	return gulp.src(['./demo/src/html/index.html'], {base: './demo/src/html/'})
		.pipe(gulp.dest('./demo/dist/html/'));
});

gulp.task('css', function () {
	return gulp.src('./demo/src/css/*.css')
		.pipe(sourcemaps.init())
		.pipe(postcss([lazysprite({
			imagePath: './demo/src/slice',
			stylesheetPath: './demo/dist/css',
			spritePath: './demo/dist/sprites',
			smartUpdate: true,
			nameSpace: '',
			logLevel: 'debug'  // 'debug','info','slient'
		}), perfectionist({
			maxAtRuleLength: false
		})]))
		.pipe(sourcemaps.write("."))
		.pipe(gulp.dest('./demo/dist/css'));
});

gulp.task('default', ['htmlcopy', 'css', 'watch']);

gulp.task('watch', function () {
	// gulp.watch(watchFiles, ['css', 'demo', 'lint']);
	gulp.watch(watchFiles, ['css', 'lint']);
});
