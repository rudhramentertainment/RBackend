import jwt from "jsonwebtoken";
import User from "../Models/userSchema.js";


export const authenticate = async (req, res, next) => {
  try {
    console.log('🔐 Authentication middleware called');
    console.log('Headers:', req.headers);

    // First try Authorization header
    let token;
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    }

    // If not in header, try cookies
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      token = cookies.auth_token;
    }

    if (!token) {
      console.log('❌ No token found in header or cookie');
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    console.log('🔑 Token received:', token.substring(0, 20) + '...');

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token decoded:', decoded);

    const user = await User.findById(decoded.userId || decoded.id).select('-password');
    if (!user) {
      console.log('❌ User not found for ID:', decoded.id);
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    console.log('✅ req.user set:', { id: req.user._id, name: req.user.fullName });

    next();
  } catch (error) {
    console.error('❌ Authentication error:', error.message);

    if (error.name === 'JsonWebTokenError')
      return res.status(401).json({ success: false, message: 'Invalid token' });

    if (error.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Token expired' });

    res.status(500).json({ success: false, message: 'Server error in authentication' });
  }
};
export const authorize = (roles = []) => {
    if (typeof roles === 'string') {
        roles = [roles];
    }
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden: You do not have access to this resource" });
        }
        next();
    };
};