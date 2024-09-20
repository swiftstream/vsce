const path = require('path')

module.exports = (env, argv) => {
    return {
        entry: env.app.isServiceWorker ? './serviceWorker.js' : './app.js',
        module: {
            rules: [{
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }]
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js']
        },
        output: {
            filename: `${env.app.target.toLowerCase()}.js`,
            path: path.resolve(__dirname, env.app.relativeOutputPath)
        }
    }
}