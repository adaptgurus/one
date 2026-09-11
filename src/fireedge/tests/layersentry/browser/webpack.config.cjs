/* SPDX-License-Identifier: Apache-2.0 */
const path = require('node:path')

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'entry.jsx'),
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: { chrome: '120' } }],
              '@babel/preset-react',
            ],
          },
        },
      },
    ],
  },
  resolve: { extensions: ['.js', '.jsx'] },
  performance: { hints: false },
}
