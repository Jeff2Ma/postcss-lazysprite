var gulp = require('gulp');
var postcss = require('gulp-postcss');
var lazysprite = require('./index.js');
var mocha = require('gulp-mocha');
// gulp autoreload
var spawn = require('child_process').spawn;

var files = ['index.js'];
var watchFiles = ['index.js', 'test/**/*'];

gulp.task('lint', function () {
	var eslint = require('gulp-eslint');
	return gulp.src(files)
		.pipe(eslint())
		.pipe(eslint.format())
		.pipe(eslint.failAfterError());
});

gulp.task('test', function () {
	return gulp.src('test/*.js', { read: false })
		.pipe(mocha({ timeout: 1000000 }));
});

gulp.task('htmlcopy', function () {
	return gulp.src(['./test/src/html/index.html'],{base: './test/src/html/'})
		.pipe(gulp.dest('./test/dist/html/'));
});

gulp.task('css', function () {
	return gulp.src('./test/src/css/*.css')
		.pipe(postcss([lazysprite({
			imagePath:'./test/src/slice',
			spritePath: './test/dist/slice',
			outputDimensions: true
		})]))
		.pipe(gulp.dest('./test/dist/css'));
});

gulp.task('default', ['htmlcopy','css', 'watch']);

gulp.task('watch', function () {
	// gulp.watch(watchFiles, ['css', 'test', 'lint']);
	gulp.watch(watchFiles, ['css']);
});

gulp.task('gulp-autoreload', function() {
	// Store current process if any
	var p;
	gulp.watch(['gulpfile.js','index.js'], spawnChildren);
	// Comment the line below if you start your server by yourslef anywhere else
	spawnChildren();

	function spawnChildren(e) {
		if(p) {
			p.kill();
		}
		p = spawn('gulp', ['css'], {stdio: 'inherit'});
	}
});
