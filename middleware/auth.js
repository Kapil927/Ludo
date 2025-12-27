const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        req.isVIP = decoded.isVIP || false;
        
        next();
    } catch (error) {
        res.status(401).json({ 
            error: 'Please authenticate.',
            message: 'Invalid or missing token'
        });
    }
};

const requireVIP = async (req, res, next) => {
    if (!req.isVIP) {
        return res.status(403).json({ 
            error: 'Access denied',
            message: 'VIP privileges required'
        });
    }
    next();
};

module.exports = { auth, requireVIP };