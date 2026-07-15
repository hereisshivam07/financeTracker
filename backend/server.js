// FORCE NODE.JS TO BYPASS LOCAL DNS BLOCKERS FOR MONGODB SRV
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// backend/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// DEFINE SYSTEM ENVIRONMENT VARIABLES
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI; 

// MIDDLEWARE CONFIGURATION (Updated for secure cross-origin requests)
app.use(cors({
  origin: [
    'http://localhost:5173', // Vite default development port
    'http://localhost:3000', // Standard alternate frontend port
    'https://financetracker-jvgt.onrender.com' // Production frontend URL
  ],
  credentials: true // Allows session headers and authorization tokens to pass securely
}));

app.use(express.json());

// Database Connection
mongoose.connect(MONGO_URI, {
    dbName: 'financeTracker' // Forcefully targets financeTracker and stops the "test" fallback!
})
.then(() => {
    console.log("MongoDB secure engine connected! 🎉");
})
.catch((err) => console.error("Database connection error:", err));

// ==========================================
// 1. FIELD CRYPTOGRAPHY HELPERS (AES-256-CBC)
// ==========================================
const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY); // Must be 32 bytes
const IV_LENGTH = 16; // Initialization Vector length

// Encrypts text into a garbled hex string
function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

// Decrypts garbled hex back into plain text
function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ==========================================
// 2. DATA SCHEMAS & MODELS
// ==========================================

// User Account Schema
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// Secure Transaction Schema (Tied to a User)
const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true }, // Will be stored encrypted
    amount: { type: String, required: true },      // Will be stored encrypted
    type: { type: String, enum: ['income', 'expense'], required: true },
    category: { type: String, required: true },
    date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ==========================================
// 3. AUTHENTICATION MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "Access denied. Token missing." });
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token." });
        req.user = user; 
        next();
    });
};

// ==========================================
// 4. API ENDPOINTS: AUTHENTICATION
// ==========================================

// AUTH: User Registration / Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "User already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({ email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AUTH: User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. API ENDPOINTS: TRANSACTIONS
// ==========================================

// TRANSACTIONS: Get User-Specific Decrypted Records
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { year, month } = req.query;
        let query = { userId: req.user.userId };

        if (year && month) {
            const parsedYear = parseInt(year);
            const parsedMonth = parseInt(month);
            
            const startDate = new Date(parsedYear, parsedMonth - 1, 1);
            const endDate = new Date(parsedYear, parsedMonth, 0, 23, 59, 59, 999);
            query.date = { $gte: startDate, $lte: endDate };
        }

        const rawTransactions = await Transaction.find(query).sort({ date: -1 });
        
        const decryptedTransactions = rawTransactions.map(t => ({
            _id: t._id,
            description: decrypt(t.description),
            amount: Number(decrypt(t.amount)),
            type: t.type,
            category: t.category,
            date: t.date
        }));
        
        res.json(decryptedTransactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TRANSACTIONS: Log an Entry (Cleaned of Budget diagnostics)
app.post('/api/transactions/add', authenticateToken, async (req, res) => {
    try {
        const { description, amount, type, category, date } = req.body;
        
        const secureDescription = encrypt(description);
        const secureAmount = encrypt(amount || 0);

        const newTransaction = new Transaction({
            userId: req.user.userId,
            description: secureDescription,
            amount: secureAmount,
            type,
            category,
            date: date ? new Date(date) : undefined
        });

        await newTransaction.save();

        res.status(201).json({ 
            message: "Transaction saved securely!", 
            transactionId: newTransaction._id
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// TRANSACTIONS: Edit/Update an Entry
app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const { description, amount, type, category, date } = req.body;
        const updateData = {};

        if (description) updateData.description = encrypt(description);
        if (amount) updateData.amount = encrypt(amount);
        if (type) updateData.type = type;
        if (category) updateData.category = category;
        if (date) updateData.date = new Date(date);

        const updated = await Transaction.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.userId },
            { $set: updateData },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: "Record not found or unauthorized." });
        res.json({ message: "Transaction updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TRANSACTIONS: Delete a specific entry
app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const deleted = await Transaction.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        if (!deleted) return res.status(404).json({ error: "Record not found or unauthorized" });
        res.json({ message: "Record cleared." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Secure Server on port ${PORT}`));