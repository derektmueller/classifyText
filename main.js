#!/usr/bin/node

var app = (function () {

var exec = require ('child_process').exec,
    Q = require ('q'),
    Lg = require ('./logisticRegression')
    ;

Q.longStackSupport = true;

function App () {
    this.trainingSet = [];

    // functions used to build training examples
    this.featureExtractors = [
//        function (string) { // length
//            return string.length;
//        },
//        function (string) { // tabs / length
//            return string.replace (/[^\t]/g, '').length /
//                string.length;
//        },
//        function (string) { // average line length
//            return string.length / string.split ("\n").length;
//        },
//        function (string) { // average non-empty line length
//            return string.length / 
//                string.split ("\n").filter (function (a) {
//                    return !a.match (/^\W+$/);
//                }).length;
//        },
//        function (string) { // number of empty lines
//            return string.split ("\n").filter (function (a) {
//                    return a.match (/^\W+$/);
//                }).length;
//        },
//        function (string) { // average word length
//            var matches = string.match (/(\w+)/g);
//            if (matches)
//                return matches.reduce (function (prev, next) {
//                    return prev + next.length;
//                }, 0) / matches.length;
//            else
//                return 0;
//        },
//        function (string) { // spaces / length
//            return string.replace (/[^ ]/g, '').length /
//                string.length;
//        },
//        function (string) { // inline comment lines
//            var matches = string.match (/[^\/]\/\[^\/]/g);
//            return matches ? matches.length : 0;
//        },
        function (string) { // underscores / length
            return string.replace (/[^_]/g, '').length /
                string.length;
        },
        function (string) { // dollar signs
            return string.replace (/[^$]/g, '').length;
        },
        function (string) { // hash tags
            return string.replace (/[^#]/g, '').length;
        },
        function (string) { // var occurences
            var matches = string.match (/var/g);
            return matches ? matches.length : 0;
        },
        function (string) { // words in all caps
            var matches = string.match (/[^A-Z][A-Z]{2,}[^A-Z]/g);
            return matches ? matches.length : 0;
        },
    ];
    this._lg = new Lg;
    this._lg.alpha = 0.1;
    this._init (); 
};

/**
 * Parse command line arguments
 */
App.prototype.parseArgs = function () {
    var getOpt = require('node-getopt').create([
        ['S', 'source-dir=[ARG+]' , 'source files'],
        ['t', 'target=[ARG+]' , 'target files'],
        ['T', 'target-dir=[ARG+]' , 'target files'],
        ['h', 'help' , 'display help text'],
        ['v', 'version', 'show version']
    ])          
    .bindHelp();

    var opt = getOpt.parseSystem();

    if ((!opt.options.source && !opt.options['source-dir']) || 
        (!opt.options.target && !opt.options['target-dir'])) {

        getOpt.showHelp ();    
        process.exit ();
    }

    // add alias keys to simplifiy access
    opt.options.sourceDir = opt.options['source-dir'];
    opt.options.targetDir = opt.options['target-dir'];
    this.options = opt.options;
};

/**
 * Check if entity is a directory
 */
App.prototype.isDir = function (entity, resolve) {
    var that = this;
    exec ('stat --format=%F ' + entity, function (error, stdout) {
        return resolve (stdout === "directory\n");
    });
};

/**
 * Get paths of files in directory
 */
App.prototype.getFiles = function (dir, resolve) {
    var that = this;
    exec ('find ' + dir + ' -type f', function (error, stdout) {
        return resolve (stdout.trim ().split ("\n"));
    });
};

/**
 * Extracts features from file
 */
App.prototype.examineFile = function (filename, resolve) {
    var that = this;
    exec ('cat ' + filename, { maxBuffer: 1024 * 1024 * 1024 }, 
        function (error, stdout) {

        if (error) { throw new Error (error); }
        var example = that.featureExtractors.map (function (fn) {
            return fn (stdout);
        });
        return resolve (example);
    });
};

/**
 * Simplfies promise creation
 */
App.prototype.promise = function (fn, args) {
    if (typeof args === 'undefined') {
        args = [];
    } else if (
        Object.prototype.toString.call (args) !== '[object Array]') {

        args = [args];
    }
    var that = this;
    return function () {
        return Q.Promise (function (resolve, reject, notify) {
            args.push (resolve);
            args.push (reject);
            args.push (notify);
            fn.apply (that, args);
        });
    };
};

/**
 * Scan source files and build training set
 */
App.prototype.train = function (resolve) {
    var that = this;
    // build training set from sources
    return Q.allSettled (
        this.options.sourceDir.map (function (source, i) {

        return Q.Promise (function (resolve) {
            // validate dir name
            return that.promise (that.isDir, source) (). 
            then (function (isDir) { // get file list
                if (isDir) {
                    return that.promise (that.getFiles, source) ();
                } else {
                    throw new Error (source + ': not a directory');
                }
            }).then (function (files) { 
                // extract features from each file individually
                var promise = Q.fcall (function () {});
                files.forEach (function (filename) {
                    promise = promise.then (
                        that.promise (that.examineFile, filename)).
                    then (function (ex) {
                        that.trainingSet.push (
                            [ex, parseInt (i, 10)]);
                    });
                });
                return promise.then (function () {
                    resolve ();
                });
            }).catch (console.log);
        });
    }));
};

App.prototype.classifyFile = function (classifiers, ex, filename) {
    var guess;
    var guessedClass = null;
    var max = -Infinity;
    for (var i in classifiers) {
        if ((guess = classifiers[i] ([1].concat (ex))) > max) {
            max = guess;
            guessedClass = i;
        }
    }
    /**/console.log (filename + ' ' + guessedClass);
};

/**
 * Scan target files, outputting predictions for each
 */
App.prototype.predict = function () {
    var that = this;

    // train classifiers for each source
    var classifiers = [];
    this.options.sourceDir.forEach (function (source, i) {
        var oneVsAllTrainingSet = JSON.parse (
            JSON.stringify (that.trainingSet)).
            map (function (ex) {
                ex[1] = ex[1] === i ? 1 : 0;
                return ex;
            });
        that._lg.setTrainingSet (oneVsAllTrainingSet);
        that._lg.gradientDescent (1000);
        classifiers.push (that._lg.getH (that._lg.Theta));
    });

    // scan target directories and make predictions for each file
    return Q.allSettled (
        this.options.targetDir.map (function (target, i) {

        return Q.Promise (function (resolve) {
            // validate dir name
            return Q.fcall (that.promise (that.isDir, target)). 
            then (function (isDir) { // get file list
                if (isDir) {
                    return that.promise (that.getFiles, target) ();
                } else {
                    throw new Error (target + ': not a directory');
                }
            }).then (function (files) { 
                // make predictions
                var promise = Q.fcall (function () {});
                files.map (function (filename) {
                    promise.then (
                        that.promise (that.examineFile, filename)).
                    then (function (ex) {
                        that.classifyFile (
                            classifiers, ex, filename);
                    });
                });
                return promise.then (function () {
                    resolve ();
                });
            });
        });
    }));
};

App.prototype._init = function () {
    var that = this;
    this.parseArgs ();
    this.train ().then (function () {
        that.predict ();
    }).catch (function (error) {
        /**/console.log (error); console.trace ();
    });
};

return new App ();

}) ();

