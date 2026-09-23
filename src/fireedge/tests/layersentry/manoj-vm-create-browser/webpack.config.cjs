/* SPDX-License-Identifier: Apache-2.0 */
const path = require('node:path')
const CopyPlugin = require('copy-webpack-plugin')

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
            babelrc: false,
            configFile: false,
            presets: [
              ['@babel/preset-env', { targets: { chrome: '120' } }],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
          },
        },
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'index.html'),
          to: 'index.html',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@FeaturesModule': path.resolve(__dirname, 'features-stub.js'),
      '@ConstantsModule': path.resolve(__dirname, 'constants-stub.js'),
      '@ModelsModule': path.resolve(__dirname, 'models-stub.js'),
      '@UtilsModule': path.resolve(__dirname, 'utils-stub.js'),
      '@ComponentsModule': path.resolve(__dirname, 'components-stub.jsx'),
      '@StylesModule': path.resolve(__dirname, 'styles-stub.js'),
      '@modules/containers/VirtualMachines/VirtualMachines': path.resolve(
        __dirname,
        'virtual-machines-stub.jsx'
      ),
      'client/apps/layersentry/components/ResourceBridge': path.resolve(
        __dirname,
        'resource-bridge-stub.jsx'
      ),
      'client/apps/layersentry/navigation': path.resolve(
        __dirname,
        '../portal-browser-qualification/navigation-stub.js'
      ),
      'client/apps/layersentry/capabilities': path.resolve(
        __dirname,
        '../portal-browser-qualification/capabilities-stub.js'
      ),
      'client/apps/layersentry/components/Primitives': path.resolve(
        __dirname,
        '../../../src/client/apps/layersentry/components/Primitives.js'
      ),
      'client/apps/layersentry/theme/tokens': path.resolve(
        __dirname,
        '../../../src/client/apps/layersentry/theme/tokens.js'
      ),
    },
    extensions: ['.js', '.jsx'],
  },
  performance: { hints: false },
}
