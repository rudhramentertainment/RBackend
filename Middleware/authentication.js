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

export const authMiddleware = (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'No token' });

    const secret = process.env.JWT_SECRET || 'your_jwt_secret';
    const decoded = jwt.verify(token, secret);
    req.user = { id: decoded.userId, role: decoded.role };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

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

export default function auth(req, res, next) {
  try {
    const header = req.headers["authorization"] || "";
    const cookieToken = req.cookies?.auth_token;
     req.userDeviceToken = req.headers['x-device-token'] || null;

    // Accept JWT from:
    // 1) Authorization: Bearer <token>
    // 2) Cookie: auth_token
    let token = null;

    if (header.startsWith("Bearer ")) token = header.substring(7).trim();
    else if (cookieToken) token = cookieToken;

    if (!token) {
      console.warn("auth middleware => no token in header/cookie");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const secret = process.env.JWT_SECRET || "your_jwt_secret";
    const payload = jwt.verify(token, secret);

    // Expecting payload like: { userId, role, iat, exp }
    if (!payload?.userId) {
      console.warn("auth middleware => decoded but no userId", payload);
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    req.user = { userId: payload.userId, role: payload.role };
    return next();
  } catch (e) {
    console.error("auth middleware error:", e.message);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
}