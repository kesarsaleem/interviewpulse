module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Required for NativeWind v4: use nativewind as the JSX import source.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
