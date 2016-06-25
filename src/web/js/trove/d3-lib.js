({
  requires: [
    { "import-type": "builtin", "name": "image-lib" },
  ],
  nativeRequires: [
    "pyret-base/js/js-numbers",
    "./build/web/js/d3.js"
  ],
  provides: {},
  theModule: function(RUNTIME, NAMESPACE, uri, IMAGE, jsnums, d3) {
    var ALLHEIGHT = 576;
    var ALLWIDTH = 701;
    var MARGIN = {'top': 30, 'left': 100, 'bottom': 45, 'right': 100};
    var NOMARGIN = {'top': 0, 'left': 0, 'bottom': 0, 'right': 0};


    function assert(val, msg) {
      if (!val) { throw new Error("Assertion failed: " + (msg || "")); }
    }

  ////////////////////////////////////////////////////////////////////////////
  // libNum
  ////////////////////////////////////////////////////////////////////////////

    function scaler(oldX, oldY, newX, newY, toFixnum) {
      /*
       * Produces a scaler function to convert a value in
       * an interval to another value in a new interval
       *
       * @param {jsnums} oldX
       * @param {jsnums} oldY
       * @param {jsnums} newX
       * @param {jsnums} newY
       * @param {boolean} toInt: if true, the result is converted to
       * integer fixnum
       * @return {Function}
       */
      return function (k) {
        var oldDiff = jsnums.subtract(k, oldX);
        var oldRange = jsnums.subtract(oldY, oldX);
        var portion = jsnums.divide(oldDiff, oldRange);
        var newRange = jsnums.subtract(newY, newX);
        var newPortion = jsnums.multiply(portion, newRange);
        var result = jsnums.add(newPortion, newX);
        return toFixnum ? jsnums.toFixnum(result) : result;
      };
    }

    function adjustInRange(k, vmin, vmax) {
      /*
       * Adjust k to be between vmin and vmax if it's not in the range
       *
       * @param {jsnums} k
       * @param {jsnums} vmin
       * @param {jsnums} vmax
       * @return {jsnums}
       */
      if (jsnums.lessThan(k, vmin)) return vmin;
      else if (jsnums.lessThan(vmax, k)) return vmax;
      else return k;
    }

    function random(a, b) {
      return Math.floor(Math.random() * (b - a + 1)) + a;
    }

    function getPrettyNumToStringDigits(digits) {
      return function(num) {
        return jsnums.toStringDigits(num, digits).replace(/\.?0*$/, '');
      };
    }

    function between(b, a, c) {
      return (jsnums.lessThanOrEqual(a, b) && jsnums.lessThanOrEqual(b, c)) ||
             (jsnums.lessThanOrEqual(c, b) && jsnums.lessThanOrEqual(b, a));
    }
    
    function numMin(a, b) { /* ignore the rest */
      // this ignores other arguments, making reducing on numMin possible
      return RUNTIME.num_min(a, b);
    }

    function numMax(a, b) { /* ignore the rest */
      // this ignores other arguments, making reducing on numMin possible
      return RUNTIME.num_max(a, b);
    }

    var libNum = {
      scaler: scaler,
      adjustInRange: adjustInRange,
      between: between,
      getPrettyNumToStringDigits: getPrettyNumToStringDigits,
      numMin: numMin,
      numMax: numMax,
      random: random,
    };

    ////////////////////////////////////////////////////////////////////////////
    // libJS
    ////////////////////////////////////////////////////////////////////////////

    function drawImage(opts) {
        /*
         * Writes an image into a canvas taking into
         * account the backing store pixel ratio and
         * the device pixel ratio.
         *
         * http://www.html5rocks.com/en/tutorials/canvas/hidpi/
         *
         * @author Paul Lewis
         * @param {Object} opts The params for drawing an image to the canvas
         */
        if(!opts.canvas) {
            throw("A canvas is required");
        }
        if(!opts.image) {
            throw("Image is required");
        }

        // get the canvas and context
        var canvas = opts.canvas,
            context = canvas.getContext('2d'),
            image = opts.image,

            // now default all the dimension info
            srcx = opts.srcx || 0,
            srcy = opts.srcy || 0,
            srcw = opts.srcw || image.naturalWidth,
            srch = opts.srch || image.naturalHeight,
            desx = opts.desx || srcx,
            desy = opts.desy || srcy,
            desw = opts.desw || srcw,
            desh = opts.desh || srch,
            auto = opts.auto,

            // finally query the various pixel ratios
            devicePixelRatio = window.devicePixelRatio || 1,
            backingStoreRatio = context.webkitBackingStorePixelRatio ||
                context.mozBackingStorePixelRatio ||
                context.msBackingStorePixelRatio ||
                context.oBackingStorePixelRatio ||
                context.backingStorePixelRatio || 1,

            ratio = devicePixelRatio / backingStoreRatio;

        // ensure we have a value set for auto.
        // If auto is set to false then we
        // will simply not upscale the canvas
        // and the default behaviour will be maintained
        if (typeof auto === 'undefined') {
            auto = true;
        }

        // upscale the canvas if the two ratios don't match
        if (auto && devicePixelRatio !== backingStoreRatio) {

            var oldWidth = canvas.width;
            var oldHeight = canvas.height;

            canvas.width = oldWidth * ratio;
            canvas.height = oldHeight * ratio;

            canvas.style.width = oldWidth + 'px';
            canvas.style.height = oldHeight + 'px';

            // now scale the context to counter
            // the fact that we've manually scaled
            // our canvas element
            context.scale(ratio, ratio);

        }

        context.drawImage(image, srcx, srcy, srcw, srch, desx, desy, desw, desh);
        return canvas;
    }

    function getBoundingClientRect(elem) {
      /*
       * Find the bounding box of elem
       *
       * @param {element} elem
       * @return {object}
       */
      var div = d3.select('body').append('div');
      div.node().appendChild(elem.cloneNode(true));
      var bbox = div.node().firstChild.getBoundingClientRect();
      div.remove();
      return bbox;
    }

    function getBBox(svg) {
      /*
       * Find the bounding box of svg elem
       *
       * @param {element} svg
       * @return {object}
       */
      var div = d3.select('body').append('div');
      div.node().appendChild(svg.cloneNode(true));
      var bbox = div.node().firstChild.getBBox();
      div.remove();
      return bbox;
    }

    function htmlspecialchars(text) {
      var div = document.createElement('div');
      var textNode = document.createTextNode(text);
      div.appendChild(textNode);
      return div.innerHTML;
    }

    var libJS = {
      'getBBox': getBBox,
      'getBoundingClientRect': getBoundingClientRect,
      'htmlspecialchars': htmlspecialchars
    };

    ////////////////////////////////////////////////////////////////////////////
    // libData
    ////////////////////////////////////////////////////////////////////////////

    function lastElement(arr) {
      /*
       * Produces the last element of arr
       *
       * @param {array} arr
       * @return {Any}
       */
      return arr[arr.length - 1];
    }

    function flatten(lst) {
      /*
       * Flatten the list
       *
       * @param {array} lst
       * @return {array}
       */
      return [].concat.apply([], lst);
    }

    function fill(n, v) {
      var i, ret = [];
      for (i = 0; i < n; i++) {
          ret.push(v);
      }
      return ret;
    }

    function range(st, ed) {
      var i, ret = [];
      for (i = st; i < ed; i++) {
          ret.push(i);
      }
      return ret;
    }

    function shuffle(o){
      //+ Jonas Raoni Soares Silva
      //@ http://jsfromhell.com/array/shuffle [v1.0]
      for(var j, x, i = o.length; i;
          j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
      return o;
    }

    var libData = {
      'lastElement': lastElement,
      'flatten': flatten,
      'fill': fill,
      'range': range,
      'shuffle': shuffle
    };

    ////////////////////////////////////////////////////////////////////////////
    // libColor
    ////////////////////////////////////////////////////////////////////////////

    function getContrast(r, g, b){
      /*
       * http://24ways.org/2010/calculating-color-contrast/
       */
    	return ((((r*299)+(g*587)+(b*114))/1000) >= 128) ? 'black' : 'white';
    }

    function convertColor(v) {

        function p(pred, name) {
            return function(val) {
                RUNTIME.makeCheckType(pred, name)(val);
                return val;
            };
        }

        var colorDb = IMAGE.colorDb,
            _checkColor = p(IMAGE.isColorOrColorString, "Color");

        function checkColor(val) {
            var aColor = _checkColor(val);
            if (colorDb.get(aColor)) {
                aColor = colorDb.get(aColor);
            }
            return aColor;
        }

        function colorString(aColor) {
            return "rgba(" + IMAGE.colorRed(aColor) + "," +
                IMAGE.colorGreen(aColor) + ", " +
                IMAGE.colorBlue(aColor) + ", " +
                IMAGE.colorAlpha(aColor) + ")";
        }

        return colorString(checkColor(v));
    }

    function changeColor(r, g, b, d) {
        r += d;
        b += d;
        g += d;

        if (r > 255) r = 255;
        else if (r < 0) r = 0;

        if (b > 255) b = 255;
        else if (b < 0) b = 0;

        if (g > 255) g = 255;
        else if (g < 0) g = 0;

        return 'rgba(' + r + ',' + g + ',' + b + ',255)';
    }

    var libColor = {
        'getContrast': getContrast,
        'convertColor': convertColor,
        'changeColor': changeColor
    };

    ////////////////////////////////////////////////////////////////////////////
    // d3common
    ////////////////////////////////////////////////////////////////////////////

    function getMargin(marginType) {
        if (marginType === "normal"){
            return MARGIN;
        }else if(marginType === "none"){
            return NOMARGIN;
        }else{
            throw "not supported margin";
        }
    }

    function getDimension(margin) {
        return {
            width: ALLWIDTH - margin.left - margin.right,
            height: ALLHEIGHT - margin.top - margin.bottom
        };
    }

    function svgTranslate(x, y) {
        if (y === undefined) {
            return "translate(" + x.toString() + ")";
        }
        return "translate(" + x.toString() + "," + y.toString() + ")";
    }

    function createDiv() {
        /*
         * Creates a blank div
         *
         * @return {d3 selection}
         */
        return d3.select(document.createElement("div"))
            .attr('class', 'maind3');
    }

    function createCanvas(detached, margin, orient) {
        /*
         * Creates a canva
         *
         * @param {fixnum} width: in pixel
         * @param {fixnum} height: in pixel
         * @param {d3 selection} detached
         * @param {string} orient
         * @return {d3 selection}
         */
        var divSvg = detached
                .append('div')
                .attr('class', 'divsvg'),
            canvas = divSvg
                .append("svg")
                .attr("width", ALLWIDTH)
                .attr("height", ALLHEIGHT)
                .append("g")
                .attr('class', 'maing')
                .append('g');

        if (orient === "top-left") {
            canvas.attr("transform", svgTranslate(margin.left, margin.top));
        } else if (orient == "center") {
            canvas.attr("transform",
                svgTranslate(ALLWIDTH / 2, ALLHEIGHT / 2));
        } else {
            throw "orient '" + orient  + "' not implemented";
        }
        return canvas;
    }

    function createSave(toolBar, detached) {
        /*
         * Create a button to download the image of canvas as PNG file
         *
         * A part of these are adapted from
         * http://techslides.com/save-svg-as-an-image
         */
        toolBar
          .append('button')
          .attr('class', 'd3btn')
          .text('💾')
          .on('click', function () {
              var svg = detached.select("svg")
                      .attr("version", 1.1)
                      .attr("xmlns", "http://www.w3.org/2000/svg"),

                  canvas = detached.append('canvas')
                      .style('display', 'none')
                      .attr('width', svg.attr("width"))
                      .attr('height', svg.attr("height")),

                  svgData = detached.append('div')
                      .style('display', 'none'),

                  html = detached.node().firstChild.innerHTML,

                  imgsrc = 'data:image/svg+xml;base64,' + btoa(html),

                  img = '<img src="' + imgsrc + '">';

              svgData.html(img);

              var image = new Image;
              image.src = imgsrc;
              image.onload = function () {
                  var opts = {
                      canvas: canvas.node(),
                      image: image
                  };
                  var a = document.createElement("a");
                  a.download = "sample.png";
                  a.href = drawImage(opts).toDataURL("image/png");
                  a.click();

                  // the image's size was doubled everytime we click
                  // the button, so remove all data to prevent this
                  // to happen
                  svgData.remove();
                  canvas.remove();
              };
          });
    }

    function callBigBang(width, height, detached, retVal, extra) {
        var toolBar = detached
          .append('div')
          .style({
            "border-right": 'dotted 1px black',
            position: 'absolute',
            top: '5px',
            left: '0px',
            height: '100%',
            width: '36px'
          });

        detached.selectAll('.overlay').style({
          fill: "none",
          "pointer-events": "all",
        });

        RUNTIME.pauseStack(function(restarter) {
          RUNTIME.getParam("d3-port")(detached.node(), width, height, function() {
            restarter.resume(retVal);
          }, function(closeButton) {
            extra(restarter);
            toolBar
              .append('button')
              .attr('class', 'd3btn exitbtn')
              .text('❌')
              .on('click', closeButton);
            createSave(toolBar, detached);
            detached.selectAll('.d3btn').style({
              'margin-right': '5px'
            });
          });
        });
    }

    function stylizeTip(detached) {
        /*
         * Add styles for tooltip
         *
         * @param {d3 selection} detached
         */
        detached.selectAll('.d3-tip')
            .style({
                'background': 'rgba(0, 0, 0, 0.8)',
                'line-height': '1.5',
                'font-weight': 'bold',
                'font-size': '8pt',
                'color': '#fff',
                'padding': '10px',
                'border-radius': '2px'
            });
    }

    var d3common = {
        getMargin: getMargin,
        getDimension: getDimension,
        svgTranslate: svgTranslate,
        createDiv: createDiv,
        createCanvas: createCanvas,
        callBigBang: callBigBang,
        stylizeTip: stylizeTip
    };

    return RUNTIME.makeJSModuleReturn({
        libData: libData,
        libNum: libNum,
        libJS: libJS,
        libColor: libColor,
        d3common: d3common,
        assert: assert,
        constants: {
          height: ALLHEIGHT,
          width: ALLWIDTH,
          margin: MARGIN,
        }
    });

  }
})