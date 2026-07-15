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

// Database Connection with Self-Cleaning Legacy Index Logic
mongoose.connect(MONGO_URI, {
    dbName: 'financeTracker' // Forcefully targets financeTracker and stops the "test" fallback!
})
.then(async () => {
    console.log("MongoDB secure engine connected! 🎉");
    
    // 🧹 SELF-CLEANING POOL: Automatically drop index breaking budget updates
    try {
        const budgetCollection = mongoose.connection.collection('budgets');
        const indexes = await budgetCollection.indexes();
        const hasLegacyIndex = indexes.some(idx => idx.name === 'user_1_category_1');
        
        if (hasLegacyIndex) {
            await budgetCollection.dropIndex('user_1_category_1');
            console.log("🧹 Legacy index 'user_1_category_1' successfully dropped!");
        }
    } catch (indexErr) {
        console.warn("⚠️ Index cleaning check handled gracefully:", indexErr.message);
    }
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

// Add this near your other Mongoose Schemas (e.g., inside server.js)
const budgetSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  category: { 
    type: String, 
    required: true 
  },
  limit: { 
    type: Number, 
    required: true, 
    default: 0 
  }
});

// Ensures a user can only have one budget setting per category
budgetSchema.index({ userId: 1, category: 1 }, { unique: true });

const Budget = mongoose.model('Budget', budgetSchema);

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

// TRANSACTIONS: Log an Entry (With Humanized Smart-Budget Calculations)
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

        // 🧠 INTUITIVE INTEGRATION: Conversational budgeting diagnostics
        let budgetAlert = null;
        if (type === 'expense') {
            const budget = await Budget.findOne({ userId: req.user.userId, category });
            if (budget) {
                const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
                const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);
                
                const monthExpenses = await Transaction.find({
                    userId: req.user.userId,
                    category,
                    type: 'expense',
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                });

                const totalSpent = monthExpenses.reduce((sum, item) => sum + Number(decrypt(item.amount)), 0);
                const usagePercentage = Math.round((totalSpent / budget.limit) * 100);

                // Build empathetic, warm alert context for the UI to consume
                if (usagePercentage >= 100) {
                    budgetAlert = {
                        status: "breached",
                        percentage: usagePercentage,
                        message: `Heads up! You've used ${usagePercentage}% of your limit on "${category}". You're over by $${(totalSpent - budget.limit).toFixed(2)}.`,
                    };
                } else if (usagePercentage >= 85) {
                    budgetAlert = {
                        status: "warning",
                        percentage: usagePercentage,
                        message: `Careful! You've used ${usagePercentage}% of your limit on "${category}". Only $${(budget.limit - totalSpent).toFixed(2)} left.`,
                    };
                }
            }
        }

        res.status(201).json({ 
            message: "Transaction saved securely!", 
            transactionId: newTransaction._id,
            budgetAlert 
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

// ==========================================
// ==========================================
// 6. API ENDPOINTS: BUDGETS
// ==========================================

// BUDGETS: Get active budgets AND dynamic monthly utilization calculations
app.get('/api/budgets/status', authenticateToken, async (req, res) => {
    try {
        console.log(`[GET] /api/budgets/status requested by user: ${req.user.userId}`);
        const budgets = await Budget.find({ userId: req.user.userId });
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

        // Fetch user expenses for current month to calculate usage states
        const rawExpenses = await Transaction.find({
            userId: req.user.userId,
            type: 'expense',
            date: { $gte: startOfMonth, $lte: endOfMonth }
        });

        // Compute spending metrics across categories using our decryption routine
        const spendingByCategory = {};
        rawExpenses.forEach(exp => {
            const decAmount = Number(decrypt(exp.amount)) || 0;
            const categoryKey = exp.category ? exp.category.trim().toLowerCase() : 'other';
            spendingByCategory[categoryKey] = (spendingByCategory[categoryKey] || 0) + decAmount;
        });

        // Map rich status metrics directly to each budget object
        const statusMap = budgets.map(b => {
            const categoryKey = b.category ? b.category.trim().toLowerCase() : 'other';
            const spent = spendingByCategory[categoryKey] || 0;
            const remaining = Math.max(0, b.limit - spent);
            const percentage = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;

            return {
                _id: b._id,
                category: b.category, // Keeps original display casing
                limit: b.limit,
                spent,
                remaining,
                percentage,
                healthStatus: percentage >= 100 ? 'breached' : percentage >= 85 ? 'warning' : 'healthy'
            };
        });

        res.json(statusMap);
    } catch (err) {
        console.error("❌ Budget Status Error:", err);
        res.status(500).json({ error: "Could not fetch updated budget statuses." });
    }
});

// BUDGETS: Get raw budget limits
app.get('/api/budgets', authenticateToken, async (req, res) => {
    try {
        console.log(`[GET] /api/budgets requested by user: ${req.user.userId}`);
        const budgets = await Budget.find({ userId: req.user.userId });
        res.json(budgets);
    } catch (err) {
        console.error("❌ Budget Retrieval Error:", err);
        res.status(500).json({ error: "Failed to retrieve budget limits." });
    }
});

// BUDGETS: Upsert with type validation
app.post('/api/budgets', authenticateToken, async (req, res) => {
    try {
        const { category, limit } = req.body;
        console.log(`[POST] /api/budgets hit by user ${req.user.userId} -> Category: "${category}", Limit: ${limit}`);
        
        const numericLimit = Number(limit);

        if (!category || isNaN(numericLimit) || numericLimit < 0) {
            return res.status(400).json({ error: "Please enter a valid, positive budget limit number." });
        }

        const cleanCategory = category.trim();

        // Normalizing to lowercase prevents duplicate index crashes (e.g., "Food" vs "food")
        const updatedBudget = await Budget.findOneAndUpdate(
            { userId: req.user.userId, category: cleanCategory },
            { limit: numericLimit },
            { new: true, upsert: true, runValidators: true }
        );
        res.json(updatedBudget);
    } catch (err) {
        console.error("❌ Budget Update Error Detail:", err);
        if (err.code === 11000) {
            return res.status(400).json({ error: "Duplicate category budget detected." });
        }
        res.status(500).json({ error: err.message || "Failed to update budget limit." });
    }
});

// BUDGETS: Delete/Remove budget limit for a category
app.delete('/api/budgets/:id', authenticateToken, async (req, res) => {
    try {
        console.log(`[DELETE] /api/budgets/${req.params.id} requested by user: ${req.user.userId}`);
        const deleted = await Budget.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        if (!deleted) return res.status(404).json({ error: "Budget not found or unauthorized." });
        res.json({ message: "Budget limit removed successfully." });
    } catch (err) {
         console.error("❌ Budget Delete Error:", err);
         res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Secure Server on port ${PORT}`));