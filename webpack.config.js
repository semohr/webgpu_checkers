const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
module.exports = {
    devtool: 'source-map',
    context: __dirname,
    entry: './src/index.ts',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: {
                    loader: 'ts-loader'
                }
            },
            {
                test: /\.wgsl$/,
                use: {
                    loader: 'ts-shader-loader'
                }
            },
            {
                test: /\.obj$/,
                type: "asset/resource"
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.wgsl']
    },
    devServer: {
        static: path.join(__dirname, 'dist'),
        compress: false,
        port: 4000
    },
    plugins: [
        new HtmlWebpackPlugin(
            {
                template: path.resolve(__dirname, 'index.html'),
                inject: false
            }

        )
    ]
}
