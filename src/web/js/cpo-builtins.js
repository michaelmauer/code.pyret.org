{
  requires: [
    { "import-type": "builtin", "name": "base" },
    { "import-type": "builtin", "name": "image" }
  ],
  provides: {},
  nativeRequires: [],
  theModule: function(runtime, namespace, _ /* intentionally unused */ ) {
    return runtime.makeJSModuleReturn({cpoBuiltins: true});
  }
}
