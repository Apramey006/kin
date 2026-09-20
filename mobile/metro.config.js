const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for @ imports
config.watchFolders = [__dirname];
config.resolver.sourceExts = [...new Set([...config.resolver.sourceExts, 'ts', 'tsx', 'js', 'jsx'])];

// Improve performance and fix QR code loading issues
config.maxWorkers = 2;
config.resetCache = true;

// Enable proper source maps for debugging
config.server = {
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      // Add CORS headers for better QR code connectivity
      res.setHeader('Access-Control-Allow-Origin', '*');
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
