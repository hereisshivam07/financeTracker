// frontend/src/App.jsx
import { useState, useEffect } from 'react';
// IMPORT RECHARTS UTILITIES
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './App.css';

// PRODUCTION API CONFIGURATION
const API_BASE_URL = 'https://financetracker-jvgt.onrender.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [userEmail, setUserEmail] = useState(localStorage.getItem('email') || '');
  const [isLoginView, setIsLoginView] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('Food');

  const fetchTransactions = () => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/transactions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Session expired");
        return res.json();
      })
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error(err);
        handleLogout();
      });
  };

  useEffect(() => {
    fetchTransactions();
  }, [token]);

  // ==========================================
  // DATA PREPROCESSING FOR CHART METRICS
  // ==========================================
  // 1. Isolate expenses and combine their category amounts into a key-value dictionary Map
  const categoryMap = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, current) => {
      const cat = current.category;
      const amt = current.amount;
      acc[cat] = (acc[cat] || 0) + amt;
      return acc;
    }, {});

  // 2. Format the dictionary map into the specific array format Recharts demands
  const chartData = Object.keys(categoryMap).map(catName => ({
    name: catName,
    value: categoryMap[catName]
  }));

  // Clean, high-contrast dashboard aesthetic palette colors
  const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed'];

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = isLoginView ? '/api/auth/login' : '/api/auth/signup';

    fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authEmail, password: authPassword })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setAuthError(data.error);
          return;
        }
        if (isLoginView) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('email', data.email);
          setToken(data.token);
          setUserEmail(data.email);
          setAuthEmail('');
          setAuthPassword('');
        } else {
          alert("Account created successfully!");
          setIsLoginView(true);
          setAuthPassword('');
        }
      })
      .catch(() => setAuthError("Server communication failure."));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    setToken('');
    setUserEmail('');
    setTransactions([]);
  };

  const handleLogTransaction = (e) => {
    e.preventDefault();
    if (!description.trim() || !amount || Number(amount) <= 0) return;

    fetch(`${API_BASE_URL}/api/transactions/add`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ description, amount, type, category }),
    })
      .then((res) => res.json())
      .then(() => {
        setDescription('');
        setAmount('');
        fetchTransactions(); 
      })
      .catch((err) => console.error(err));
  };

  const handleDelete = (id) => {
    fetch(`${API_BASE_URL}/api/transactions/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then(() => fetchTransactions())
      .catch((err) => console.error(err));
  };

  const incomeTotal = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenseTotal = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netBalance = incomeTotal - expenseTotal;

  if (!token) {
    return (
      <div className="dashboard-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="panel-card" style={{ width: '100%', maxWidth: '420px', padding: '40px 30px' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '8px', color: '#0f172a' }}>
              {isLoginView ? "Vault Gate" : "Register Access"}
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              {isLoginView ? "Enter your keys to decrypt your financial records." : "Create a new private ledger workspace account."}
            </p>
          </div>

          {authError && (
            <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '20px', fontWeight: '500' }}>
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="finance-form">
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="form-input" required />
            </div>
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Private Password</label>
              <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="form-input" required />
            </div>
            <button type="submit" className="submit-btn" style={{ background: '#0f172a' }}>
              {isLoginView ? "Decrypt Ledger" : "Construct Account"}
            </button>
          </form>

          <div style={{ marginTop: '25px', textAlign: 'center', fontSize: '0.88rem', color: '#64748b' }}>
            {isLoginView ? "New operator? " : "Existing operator? "}
            <span onClick={() => { setIsLoginView(!isLoginView); setAuthError(''); }} style={{ color: '#2563eb', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}>
              {isLoginView ? "Create workspace credentials" : "Return to sign in"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper">
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1>Personal Capital Ledger</h1>
          <p>Monitor metrics, categorize spending patterns, and maintain financial equilibrium.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: '#fff', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: '500' }}>🛡️ {userEmail}</span>
          <button onClick={handleLogout} className="delete-btn" style={{ padding: '4px 8px' }}>Lock Vault</button>
        </div>
      </header>

      <section className="metrics-grid">
        <div className="metric-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <h3>Net Balance</h3>
          <p style={{ color: netBalance >= 0 ? '#1e293b' : '#dc2626' }}>
            ₹{netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="metric-card" style={{ borderLeft: '4px solid #16a34a' }}>
          <h3>Total Revenue</h3>
          <p className="amt-income">₹{incomeTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="metric-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <h3>Total Outflow</h3>
          <p className="amt-expense">₹{expenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      </section>

      {/* DYNAMIC VISUAL INTERACTIVE LAYER PANEL (CLIPPING BUG FIXED) */}
      {chartData.length > 0 && (
        <section className="panel-card" style={{ marginBottom: '40px', height: '360px' }}>
          <h2 style={{ marginBottom: '5px' }}>Outflow Allocation Matrix</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '15px' }}>
            Proportional analytics showing real-time distribution across active spending categories.
          </p>
          <div style={{ width: '100%', height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              {/* Added margin here to give the circle breathing room inside the boundary box */}
              <PieChart margin={{ top: 15, right: 10, bottom: 5, left: 10 }}>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%" // Set to 50% to center it perfectly and stop top clipping
                  innerRadius={55} // Slighly reduced to maintain perfect proportions
                  outerRadius={80} // Slighly adjusted to keep it inside container bounds
                  paddingAngle={4}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₹${value.toFixed(2)}`} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="dashboard-content">
        <section className="panel-card form-sticky">
          <h2>Log New Transaction</h2>
          <form onSubmit={handleLogTransaction} className="finance-form">
            <div className="form-group">
              <label>Description</label>
              <input type="text" placeholder="e.g., Grocery Store" value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" />
            </div>
            <div className="form-group">
              <label>Amount (INR)</label>
              <input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="form-input" />
            </div>
            <div className="form-group">
              <label>Flow Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="form-select">
                <option value="expense">Expense (Outflow)</option>
                <option value="income">Income (Inflow)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Category Tag</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select">
                <option value="Food">Food & Dining</option>
                <option value="Rent">Rent & Housing</option>
                <option value="Salary">Salary & Dividends</option>
                <option value="Utilities">Utilities & Bills</option>
                <option value="Entertainment">Entertainment</option>
              </select>
            </div>
            <button type="submit" className="submit-btn">Record Entry</button>
          </form>
        </section>

        <section className="ledger-table-container">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
                    No financial records logged. Use the panel on the left to add your first entry.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t._id}>
                    <td>{new Date(t.date).toLocaleDateString('en-IN')}</td>
                    <td style={{ fontWeight: '500' }}>{t.description}</td>
                    <td><span className="badge">{t.category}</span></td>
                    <td className={t.type === 'income' ? 'amt-income' : 'amt-expense'}>
                      {t.type === 'income' ? '+' : '-'} ₹{t.amount.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => handleDelete(t._id)} className="delete-btn">Remove</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

export default App;