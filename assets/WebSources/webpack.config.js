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
            filename: `${env.app.target}.js`,
            path: env.app.absoluteOutputPath
        }
    }
}