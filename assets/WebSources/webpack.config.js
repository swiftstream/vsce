const webpack = require('webpack')

module.exports = (env, argv) => {
    const config = {
        entry: env.app.isServiceWorker ? './serviceWorker.js' : './app.js',
        module: {
            rules: [{
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }]
        },
        plugins: [
            new webpack.DefinePlugin({
                '_SwiftStreamEnv_': JSON.stringify({
                    isDevelopment: process.env.NODE_ENV === 'development',
                    target: env.app.target
                })
            })
        ],
        resolve: {
            extensions: ['.tsx', '.ts', '.js']
        },
        output: {
            filename: `${env.app.target}.js`,
            path: env.app.absoluteOutputPath
        }
    }
    return config
}