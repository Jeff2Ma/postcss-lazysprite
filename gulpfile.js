var gulp = require('gulp');
var postcss = require('gulp-postcss');
var lazysprite = require('./index.js');
var mocha = require('gulp-mocha');
var sourcemaps = require('gulp-sourcemaps');
var perfectionist = require('perfectionist');

var files = ['index.js'];
var watchFiles = ['index.js', 'gulpfile.js', 'test/src/**/**'];

gulp.task('lint', function () {
	var eslint = require('gulp-eslint');
	return gulp.src(files)
		.pipe(eslint())
		.pipe(eslint.format())
		.pipe(eslint.failAfterError());
});

gulp.task('test', function () {
	return gulp.src('test/*.js', {read: false})
		.pipe(mocha({timeout: 1000000}));
});

gulp.task('htmlcopy', function () {
	return gulp.src(['./test/src/html/index.html'], {base: './test/src/html/'})
		.pipe(gulp.dest('./test/dist/html/'));
});

gulp.task('css', function () {
	return gulp.src('./test/src/css/*.css')
		.pipe(sourcemaps.init())
		.pipe(postcss([lazysprite({
			imagePath: './test/src/slice',
			stylesheetPath: './test/dist/css',
			spritePath: './test/dist/sprites',
			smartUpdate: true,
			nameSpace: ''
		}), perfectionist({
			maxAtRuleLength: false
		})]))
		.pipe(sourcemaps.write("."))
		.pipe(gulp.dest('./test/dist/css'));
});

gulp.task('default', ['htmlcopy', 'css', 'watch']);

gulp.task('watch', function () {
	// gulp.watch(watchFiles, ['css', 'test', 'lint']);
	gulp.watch(watchFiles, ['css', 'lint']);
});
