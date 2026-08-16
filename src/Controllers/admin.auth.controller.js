const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../Models/admin.model');
const env = require('../Configs/env');

// --- Controllers (inlined from Admin/adminBackend/src/Controllers/*)
const adminSignup = async (req, res) => {
  try {
    const { firstname, lastname, email, password, role } = req.body;

    const existingAdmin = await Admin.exists({});
    if (existingAdmin) {
      return res.status(403).json({ message: 'Admin signup is disabled after initial setup' });
    }

    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingAdminWithEmail = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdminWithEmail) {
      return res.status(409).json({ message: 'Admin account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({
      firstname,
      lastname,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'admin'
    });

    await newAdmin.save();

    const token = jwt.sign(
      { id: newAdmin._id, email: newAdmin.email, role: newAdmin.role },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'Admin registered successfully',
      token,
      admin: {
        id: newAdmin._id,
        firstname: newAdmin.firstname,
        lastname: newAdmin.lastname,
        email: newAdmin.email,
        role: newAdmin.role
      }
    });
  } catch (error) {
    console.error('Error signing up admin:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });

    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      message: 'Admin login successful',
      token,
      admin: {
        id: admin._id,
        firstname: admin.firstname,
        lastname: admin.lastname,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Error logging in admin:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    return res.status(200).json({ admin });
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  adminSignup,
  adminLogin,
  getAdminProfile
};
