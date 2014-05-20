define(["js/ffi-helpers", "trove/srcloc", "trove/error", "compiler/compile-structs.arr", "trove/image-lib", "./output-ui.js"], function(ffiLib, srclocLib, errorLib, csLib, imageLib, outputUI) {

  function drawError(container, editor, runtime, exception) {
    var ffi = ffiLib(runtime, runtime.namespace);
    var image = imageLib(runtime, runtime.namespace);
    var cases = ffi.cases;
    runtime.loadModules(runtime.namespace, [srclocLib, errorLib, csLib], function(srcloc, error, cs) {
      var get = runtime.getField;
      function mkPred(pyretFunName) {
        return function(val) { return get(error, pyretFunName).app(val); }
      }

      var isRuntimeError = mkPred("RuntimeError");

      // Exception will be one of:
      // - an Array of compileErrors,
      // - a PyretException with a stack and a Pyret value error
      // - something internal and JavaScripty, which we don't want
      //   users to see but will have a hard time ruling out

      if(exception instanceof Array) {
        drawCompileErrors(exception);
      } else if(runtime.isPyretException(exception)) {
        drawPyretException(exception);
      } else {
        drawUnknownException(exception);
      }

      function drawSrcloc(s) {
        return s ? $("<span>").addClass("srcloc").text(get(s, "format").app(true)) : $("<span>");
      }
      
      function errorHover(dom, locs) {
        outputUI.hoverLocs(editor, runtime, srcloc, dom, locs, "error-highlight");
      }

      function drawCompileErrors(e) {
        function drawUnboundId(idExpr) {
          var dom = $("<div>").addClass("compile-error");
          var name = get(get(idExpr, "id"), "toname").app();
          var loc = get(idExpr, "l");
          cases(get(srcloc, "Srcloc"), "Srcloc", loc, {
            "builtin": function(_) {
              console.error("Should not be allowed to have a builtin that's unbound", e);
            },
            "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
              var p = $("<p>");
              p.append("The name ");
              p.append($("<span>").addClass("code").text(name));
              p.append(" is used but not defined at ");
              dom.append(p);
              dom.append(drawSrcloc(loc));
              errorHover(dom, [loc]);
              container.append(dom);
            }
          });
        }
        function drawShadowId(id, newLoc, oldLoc) {
          var dom = $("<div>").addClass("compile-error");
          cases(get(srcloc, "Srcloc"), "Srcloc", oldLoc, {
            "builtin": function(_) {
              var p = $("<p>");
              p.append("Oops!  The name ");
              p.append($("<span>").addClass("code").text(id));
              p.append(" is taken by Pyret, and your program isn't allowed to define it.  You need to pick a different name for ");
              p.append($("<span>").addClass("code").text(id));
              p.append(" at ");
              p.append(drawSrcloc(newLoc));
              dom.append(p);
              errorHover(dom, [newLoc]);
              container.append(dom);
            },
            "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
              var p = $("<p>");
              p.append("It looks like you defined the name ");
              p.append($("<span>").addClass("code").text(id));
              p.append(" twice, at ");
              var loc1 = drawSrcloc(oldLoc);
              var loc2 = drawSrcloc(newLoc);
              var p2 = $("<p>");
              p2.text("You need to pick a new name for one of them");
              dom.append(p).append("<br>").append(loc1).append("<br>").append(loc2).append("<br>").append(p2);
              errorHover(dom, [oldLoc, newLoc]);
              container.append(dom);
            }
          });
        }

        function drawWfError(msg, loc) {
          var dom = $("<div>").addClass("compile-error");
          dom.append("<p>").text(msg);
          dom.append("<br>");
          dom.append(drawSrcloc(loc));
          errorHover(dom, [loc]);
          container.append(dom);
        }

        function drawWfErrSplit(msg, locs) {
          var dom = $("<div>").addClass("compile-error");
          dom.append("<p>").text(msg);
          dom.append("<br>")
          var locArray = ffi.toArray(locs)
          locArray.forEach(function(l) {
            dom.append(drawSrcloc(l)).append("<br>");
          });
          errorHover(dom, locArray);
          container.append(dom);
        }

        function drawErrorToString(e) {
          return function() {
            runtime.safeCall(function() {
              return get(e, "tostring").app()
            }, function(s) {
              container.append($("<div>").addClass("compile-error").text(s));
            });
          };
        }


        function drawCompileError(e) {
          cases(get(cs, "CompileError"), "CompileError", e, {
              "unbound-id": drawUnboundId,
              "shadow-id": drawShadowId,
              "duplicate-id": drawShadowId, // NOTE(joe): intentional re-use, not copypasta
              "wf-err": drawWfError,
              "wf-err-split": drawWfErrSplit,
              "else": drawErrorToString(e)
            });
        }
        e.forEach(drawCompileError);
      }

      function getDomValue(v, f) {
        if(runtime.isOpaque(v) && image.isImage(v.val)) {
          f(v.val.toDomNode());
        } else {
          runtime.safeCall(function() {
            return runtime.toReprJS(v, "_torepr")
          }, function(str) {
            f($("<div>").text(str));
          });
        }
      }

      function drawPyretException(e) {
        function drawRuntimeErrorToString(e) {
          return function() {
            container.append($("<div>").text(String(e)));
          }
        }
        function getLastUserLocation(e) {
          var srclocStack = e.pyretStack.map(runtime.makeSrcloc);
          var isSrcloc = function(s) { return runtime.unwrap(get(srcloc, "is-srcloc").app(s)); }
          var userLocs = srclocStack.filter(function(l) { return l && isSrcloc(l); });
          var probablyErrorLocation = userLocs[0];
          return probablyErrorLocation;
        }
        function drawGenericTypeMismatch(value, type) {
          // TODO(joe): How to improve this search?
          var probablyErrorLocation = getLastUserLocation(e);
          var dom = $("<div>").addClass("compile-error");
          getDomValue(value, function(valDom) {
            dom.append($("<p>").text("Expected to get a " + type + " as an argument, but got this instead: "))
              .append($("<br>"))
              .append(valDom)
              .append($("<br>"))
              .append($("<p>").text("at "))
              .append($("<br>"))
              .append(drawSrcloc(probablyErrorLocation));
            $(valDom).trigger({type: 'afterAttach'});
            $('*', valDom).trigger({type : 'afterAttach'});
            container.append(dom);
            errorHover(dom, [probablyErrorLocation]);
          });
        }
        function drawArityMismatch(funLoc, arity, args) {
          args = ffi.toArray(args);
          var probablyErrorLocation = getLastUserLocation(e);
          var dom = $("<div>").addClass("compile-error");
          var argDom = $("<div>");
          setTimeout(function() {
            args.forEach(function(a) {
              outputUI.renderPyretValue(argDom, runtime, a);
            });
          }, 0);
          cases(get(srcloc, "Srcloc"), "Srcloc", funLoc, {
            "srcloc": function(/* skip args */) {
              dom.append($("<p>").text("Expected to get " + arity + " arguments when calling the function at"))
                .append($("<br>"))
                .append(drawSrcloc(funLoc))
                .append($("<br>"))
                .append($("<p>").text("from"))
                .append($("<br>"))
                .append(drawSrcloc(probablyErrorLocation))
                .append($("<br>"))
                .append($("<p>").text("but got these " + args.length + " arguments: "))
                .append($("<br>"))
                .append(argDom)
              container.append(dom);
              errorHover(dom, [funLoc, probablyErrorLocation]);
            },
            "builtin": function(name) {
              dom.append($("<p>").text("Expected to get " + arity + " arguments at"))
                .append($("<br>"))
                .append(drawSrcloc(probablyErrorLocation))
                .append($("<br>"))
                .append($("<p>").text("but got these " + args.length + " arguments: "))
                .append($("<br>"))
                .append(argDom);
              container.append(dom);
              errorHover(dom, [probablyErrorLocation]);
            }
          });
        }
        function drawMessageException(message) {
          var probablyErrorLocation = getLastUserLocation(e);
          var dom = $("<div>").addClass("compile-error");
          if(probablyErrorLocation !== undefined) {
            dom.append($("<p>").text(message + " At:"))
              .append($("<br>"))
              .append(drawSrcloc(probablyErrorLocation));
            errorHover(dom, [probablyErrorLocation]);
          } else {
            dom.append($("<p>").text(message));
          }
          container.append(dom);
        }
        function drawNonBooleanCondition(loc, type, value) {
          getDomValue(value, function(v) {
            var dom = $("<div>").addClass("compile-error");
            dom.append($("<p>").text("Expected true or false for the test in an " + type + " expression, but got:"));
            dom.append($("<br>"));
            dom.append(v);
            $(v).trigger({type: 'afterAttach'});
            $('*', v).trigger({type : 'afterAttach'});
            dom.append(drawSrcloc(loc));
            errorHover(dom, [loc]);
            container.append(dom);
          });
        }
        function drawNonBooleanOp(loc, position, type, value) {
          getDomValue(value, function(v) {
            var dom = $("<div>").addClass("compile-error");
            dom.append($("<p>").text("Expected true or false for the " + position + " argument in " + type + " expression, but got:"));
            dom.append($("<br>"));
            dom.append(v);
            $(v).trigger({type: 'afterAttach'});
            $('*', v).trigger({type : 'afterAttach'});
            dom.append($("<br>"));
            dom.append(drawSrcloc(loc));
            errorHover(dom, [loc]);
            container.append(dom);
          });
        }
        function drawNonFunctionApp(loc, nonFunVal, args) {
          getDomValue(nonFunVal, function(v) {
            var dom = $("<div>").addClass("compile-error");
            dom.append($("<p>").text("Expected a function in application but got:"));
            dom.append($("<br>"));
            dom.append(v);
            $(v).trigger({type: 'afterAttach'});
            $('*', v).trigger({type : 'afterAttach'});
            dom.append($("<br>"));
            dom.append(drawSrcloc(loc));
            errorHover(dom, [loc]);
            container.append(dom);
          });
        }
        function drawUserBreak() {
          container.append($("<div>").addClass("compile-error").text("Program stopped by user"));
        }
        
        function drawPyretRuntimeError() {
          cases(get(error, "RuntimeError"), "RuntimeError", e.exn, {
              "generic-type-mismatch": drawGenericTypeMismatch,
              "arity-mismatch": drawArityMismatch,
              "message-exception": drawMessageException,
              "non-boolean-condition": drawNonBooleanCondition,
              "non-boolean-op": drawNonBooleanOp,
              "non-function-app": drawNonFunctionApp,
              "user-break": drawUserBreak,
              "else": drawRuntimeErrorToString(e)
            });
        }

        function drawParseErrorNextToken(loc, nextToken) {
          var explanationMissing =
            $("<div>")
              .append($("<p>").text("The program is missing something"))
              .append($("<p>").html("Look carefully before the <span class='error-highlight'>highlighted text</span>.  Is something missing just before it?  Common missing items are colons (<code>:</code>), commas (<code>,</code>), string markers (<code>\"</code>), and keywords."))
              .append($("<p>").html("<em>Usually, inserting the missing item will fix this error.</em>"));
          var explanationExtra =
            $("<div>")
              .append($("<p>").text("The program contains something extra"))
              .append($("<p>").html("Look carefully at the <span class='error-highlight'>highlighted text</span>.  Does it contains something extra?  A common source of errors is typing too much text or in the wrong order."))
              .append($("<p>").html("<em>Usually, removing the extra item will fix this error.</em>  However, you may have meant to keep this text, so think before you delete!"));
          var explanation = 
            $("<div>")
              .append($("<p>").text("Typical reasons for getting this error are"))
              .append($("<ul>")
                .append($("<li>").append(explanationMissing))
                .append($("<li>").append(explanationExtra)));
          var dom = $("<div>").addClass("parse-error");
          dom.append($("<p>").text("Pyret didn't understand your program around ").append(drawSrcloc(loc)));
          dom.append(expandableMore(explanation));
          errorHover(dom, [loc]);
          container.append(dom);
        }

        function drawPyretParseError() {
          cases(get(error, "ParseError"), "ParseError", e.exn, {
              "parse-error-next-token": drawParseErrorNextToken,
              "else": drawRuntimeErrorToString(e)
            });
        }
        if(!runtime.isObject(e.exn)) {
          drawRuntimeErrorToString(e)();
        }
        else if(mkPred("RuntimeError")(e.exn)) {
          drawPyretRuntimeError();
        }
        else if(mkPred("ParseError")(e.exn)) {
          drawPyretParseError();
        } else {
          drawRuntimeErrorToString(e);
        }
      }

      function drawUnknownException(e) {
        container.append($("<div>").text("An unexpected error occurred: " + String(e)));
      }


    });
  }

  return {
    drawError: drawError
  }

});
