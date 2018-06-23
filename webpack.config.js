const path = require('path');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  entry: {
    index: './src/index',
  },

  output: {
    path: path.join(__dirname, 'docs'),
    filename: '[name].js',
  },

  optimization: {
    minimizer: [
      new UglifyJSPlugin({
        uglifyOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
    ],
  },

  devtool: 'source-map',
};
