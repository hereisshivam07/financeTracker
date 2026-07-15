// frontend/src/App.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';

// PRODUCTION API CONFIGURATION
const API_BASE_URL = 'https://financetracker-jvgt.onrender.com/api';

// Comprehensive, expanded real-life category lists with visual emojis
const CATEGORY_MAP = {
  // Expense Categories
  'Food': '🥑 Food & Dining',
  'Groceries': '🛒 Groceries',
  'Rent': '🏠 Rent & Housing',
  'Utilities': '⚡ Bills & Utilities',
  'Transport': '🚗 Fuel & Transport',
  'Shopping': '🛍️ Shopping',
  'Entertainment': '🎬 Entertainment & Leisure',
  'Medical': '💊 Healthcare & Medical',
  'Education': '📚 Education & Learning',
  'Investments_Out': '📈 Investments (Outflow)',
  'Others_Out': '📦 Miscellaneous Expense',
  
  // Income Categories
  'Salary': '💼 Primary Salary',
  'Freelance': '💻 Side Hustles & Freelance',
  'Investments_In': '🪙 Investment Returns',
  'Gifts': '🎁 Gifts & Grants',
  'Others_In': '💰 Other Income'
};

// Sleek iOS visual colors for categories
const CATEGORY_COLORS = {
  'Food': '#ff9500',           // Orange
  'Groceries': '#ffcc00',      // Yellow
  'Rent': '#5856d6',           // Purple
  'Utilities': '#af52de',      // Light Indigo
  'Transport': '#5ac8fa',      // Teal Blue
  'Shopping': '#ff2d55',       // Pink
  'Entertainment': '#ff3b30',  // Red
  'Medical': '#4cd964',        // Mint
  'Education': '#34aadc',      // Soft Blue
  'Investments_Out': '#007aff', // Blue
  'Others_Out': '#8e8e93',      // Gray
  'Salary': '#34c759',         // Green
  'Freelance': '#30b0c7',      // Teal
  'Investments_In': '#bf5af2',  // Purple Indigo
  'Gifts': '#ff2d55',          // Pink
  'Others_In': '#ff9500'       // Orange
};

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('email') || '');
  const [isLoginView, setIsLoginView] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [dbBudgets, setDbBudgets] = useState({}); // Dynamic budgets fetched from backend database
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]); // Date Picker State
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('Food');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // FRONTEND INTERACTION & FILTER STATES
  const [timeScope, setTimeScope] = useState('all'); // 'all' or 'current-month'
  const [searchTerm, setSearchTerm] = useState('');
  const [flowFilter, setFlowFilter] = useState('all'); // 'all', 'expense', or 'income'

  // Safely fetch transactions
  const fetchTransactions = useCallback(() => {
    if (!token) return;
    setIsLoading(true);

    let url = `${API_BASE_URL}/api/transactions`;
    if (timeScope === 'current-month') {
      // Send July 2026 query params directly to backend
      url += `?year=2026&month=7`;
    }

    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Session expired");
        return res.json();
      })
      .then((data) => {
        setTransactions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        handleLogout();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token, timeScope]);

  // Fetch customizable budget limits from DB database
  const fetchBudgets = useCallback(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/budgets`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const budgetMap = {};
          data.forEach(b => {
            budgetMap[b.category] = b.limit;
          });
          setDbBudgets(budgetMap);
        }
      })
      .catch((err) => console.error("Could not load budgets:", err));
  }, [token]);

  // Trigger data sync on initial render or view filters adjustment
  useEffect(() => {
    if (token) {
      fetchTransactions();
      fetchBudgets();
    }
  }, [fetchTransactions, fetchBudgets, token]);

  // Synchronize category selection when flipping between Expense & Income
  useEffect(() => {
    setCategory(type === 'expense' ? 'Food' : 'Salary');
  }, [type]);

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);
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
      .catch(() => setAuthError("Server communication failure."))
      .finally(() => setIsSubmitting(false));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    setToken('');
    setUserEmail('');
    setTransactions([]);
    setDbBudgets({});
  };

  const handleLogTransaction = (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Please enter a valid description and a positive amount.");
      return;
    }

    setIsSubmitting(true);
    fetch(`${API_BASE_URL}/api/transactions/add`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        description: description.trim(), 
        amount: parsedAmount, 
        type, 
        category,
        date: date // Now sending custom user date
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not log transaction");
        return res.json();
      })
      .then(() => {
        setDescription('');
        setAmount('');
        setDate(new Date().toISOString().split('T')[0]); // reset to current date
        fetchTransactions(); 
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to record entry. Please try again.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleDelete = (id) => {
    if (!window.confirm("Are you sure you want to remove this ledger entry?")) return;
    
    fetch(`${API_BASE_URL}/api/transactions/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to delete entry");
        return res.json();
      })
      .then(() => fetchTransactions())
      .catch((err) => {
        console.error(err);
        alert("Error deleting transaction.");
      });
  };

  // Set/Edit a category's budget dynamically to database
  const handleUpdateBudgetLimit = (catKey) => {
    const currentLimit = dbBudgets[catKey] || 0;
    const inputLimit = prompt(`Specify maximum monthly budget for ${CATEGORY_MAP[catKey] || catKey} (INR):`, currentLimit);
    if (inputLimit === null) return; // User cancelled prompt
    
    const parsedLimit = parseFloat(inputLimit);
    if (isNaN(parsedLimit) || parsedLimit < 0) {
      alert("Please input a valid numeric value.");
      return;
    }

    fetch(`${API_BASE_URL}/api/budgets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ category: catKey, limit: parsedLimit })
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to update budget");
        return res.json();
      })
      .then(() => fetchBudgets())
      .catch(err => {
        console.error(err);
        alert("Error updating budget record.");
      });
  };

  // React state filtering based on Search Query + Flow Pill
  const finalFilteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            t.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFlow = flowFilter === 'all' || t.type === flowFilter;
      return matchesSearch && matchesFlow;
    });
  }, [transactions, searchTerm, flowFilter]);

  // Compile calculations based on current scoped dataset
  const incomeTotal = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenseTotal = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netBalance = incomeTotal - expenseTotal;

  // Render category distribution bars
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const groupedExpenses = expenseTransactions.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {});

  const categoryBreakdownList = Object.keys(groupedExpenses)
    .map(cat => {
      const totalAmount = groupedExpenses[cat];
      const percentage = expenseTotal > 0 ? (totalAmount / expenseTotal) * 100 : 0;
      
      // Pull dynamic limits directly from DB object map (default to 0)
      const limit = dbBudgets[cat] || 0;
      const limitUsagePercentage = limit > 0 ? (totalAmount / limit) * 100 : 0;
      
      let displayColor = CATEGORY_COLORS[cat] || '#8e8e93';
      let isWarning = false;
      let isCritical = false;
      
      if (limit > 0) {
        if (limitUsagePercentage >= 100) {
          displayColor = '#ff3b30'; // iOS Red
          isCritical = true;
        } else if (limitUsagePercentage >= 85) {
          displayColor = '#ff9500'; // iOS Orange
          isWarning = true;
        }
      }

      return {
        key: cat,
        label: CATEGORY_MAP[cat] || cat,
        amount: totalAmount,
        percentage: percentage,
        limitUsagePercentage,
        limit,
        color: displayColor,
        isWarning,
        isCritical
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Auth Screen View
  if (!token) {
    return (
      <div className="dashboard-wrapper login-screen">
        <div className="panel-card auth-card">
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '8px', color: '#0f172a' }}>
              Vault Gate
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              {isLoginView ? "Enter your keys to decrypt your financial records." : "Create a new private ledger workspace account."}
            </p>
          </div>

          {authError && (
            <div className="error-alert">
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="finance-form">
            <div className="form-group">
              <label>Email Address</label>
              <input 
                type="email" 
                value={authEmail} 
                onChange={(e) => setAuthEmail(e.target.value)} 
                className="form-input" 
                required 
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Private Password</label>
              <input 
                type="password" 
                value={authPassword} 
                onChange={(e) => setAuthPassword(e.target.value)} 
                className="form-input" 
                required 
                disabled={isSubmitting}
              />
            </div>
            <button 
              type="submit" 
              className="submit-btn" 
              style={{ background: '#0f172a' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Processing..." : isLoginView ? "Decrypt Ledger" : "Construct Account"}
            </button>
          </form>

          <div className="auth-toggle-text">
            {isLoginView ? "New operator? " : "Existing operator? "}
            <span onClick={() => { if (!isSubmitting) { setIsLoginView(!isLoginView); setAuthError(''); } }}>
              {isLoginView ? "Create workspace credentials" : "Return to sign in"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Workdesk UI View
  return (
    <div className="dashboard-wrapper">
      <header className="dashboard-header">
        <div className="header-brand">
          <h1>Personal Capital Ledger</h1>
          <p>Monitor metrics, categorize spending patterns, and maintain financial equilibrium.</p>
        </div>
        <div className="header-meta">
          <span className="user-badge">🛡️ {userEmail}</span>
          <button onClick={handleLogout} className="lock-btn">Lock Vault</button>
        </div>
      </header>

      {/* TIMELINE SCOPING SWITCHER (Queries directly to database API) */}
      <div className="time-filter-panel">
        <button 
          className={`time-pill ${timeScope === 'all' ? 'active' : ''}`}
          onClick={() => setTimeScope('all')}
        >
          All Time
        </button>
        <button 
          className={`time-pill ${timeScope === 'current-month' ? 'active' : ''}`}
          onClick={() => setTimeScope('current-month')}
        >
          📅 July 2026
        </button>
      </div>

      <section className="metrics-grid">
        <div className="metric-card net-balance-card" style={{ borderLeft: '4px solid #007aff' }}>
          <h3>Net Balance</h3>
          <p style={{ color: netBalance >= 0 ? '#1c1c1e' : '#ff3b30' }}>
            ₹{netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="metric-card" style={{ borderLeft: '4px solid #34c759' }}>
          <h3>Total Revenue</h3>
          <p className="amt-income">₹{incomeTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="metric-card" style={{ borderLeft: '4px solid #ff3b30' }}>
          <h3>Total Outflow</h3>
          <p className="amt-expense">₹{expenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      </section>

      {/* 📊 CATEGORY TRACKER LINKED TO DYNAMIC DATABASE BUDGETS */}
      {categoryBreakdownList.length > 0 && (
        <section className="panel-card metrics-breakdown-card">
          <div className="breakdown-header">
            <div>
              <h2>Outflow Distribution Profile</h2>
              <span className="breakdown-subtitle">Click the edit button (✏️) on any category to change database limits</span>
            </div>
            {timeScope !== 'current-month' && (
              <span className="info-warning-tag">⚠️ Switch to "July 2026" above to view active budget targets</span>
            )}
          </div>
          
          <div className="allocation-track-list">
            {categoryBreakdownList.map((item) => (
              <div key={item.key} className="allocation-row">
                <div className="allocation-details">
                  <span className="allocation-label">
                    {item.label}
                    {item.isCritical && <span className="warning-pill red">Over Budget!</span>}
                    {item.isWarning && <span className="warning-pill orange">Approaching Limit</span>}
                    <button 
                      onClick={() => handleUpdateBudgetLimit(item.key)} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.6 }}
                      title="Edit Budget Target"
                    >
                      ✏️
                    </button>
                  </span>
                  <span className="allocation-values">
                    <strong style={{ color: '#1c1c1e' }}>₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    {item.limit > 0 && timeScope === 'current-month' ? (
                      <span className="allocation-percentage" style={{ color: item.isCritical ? '#ff3b30' : '#8e8e93' }}>
                        (₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })} / ₹{item.limit.toLocaleString('en-IN', { minimumFractionDigits: 0 })} Budgeted)
                      </span>
                    ) : (
                      <span className="allocation-percentage">({item.percentage.toFixed(1)}%)</span>
                    )}
                  </span>
                </div>
                {/* Horizontal Progress Track */}
                <div className="allocation-bar-bg">
                  <div 
                    className="allocation-bar-fill" 
                    style={{ 
                      width: `${Math.min(item.limit > 0 && timeScope === 'current-month' ? item.limitUsagePercentage : item.percentage, 100)}%`, 
                      backgroundColor: item.color 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="dashboard-content">
        {/* Input Form Column */}
        <section className="panel-card form-sticky">
          <h2>Log New Transaction</h2>
          <form onSubmit={handleLogTransaction} className="finance-form">
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text" 
                placeholder="e.g., Groceries shopping" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                className="form-input" 
                required
              />
            </div>
            
            <div className="form-group">
              <label>Amount (INR)</label>
              <input 
                type="number" 
                step="any"
                placeholder="0.00" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)} 
                className="form-input" 
                required
              />
            </div>

            <div className="form-group">
              <label>Transaction Date</label>
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                className="form-input" 
                required
              />
            </div>

            <div className="form-group">
              <label>Flow Type</label>
              <div className="ios-toggle-selector">
                <button 
                  type="button" 
                  className={type === 'expense' ? 'active expense' : ''} 
                  onClick={() => setType('expense')}
                >
                  Expense
                </button>
                <button 
                  type="button" 
                  className={type === 'income' ? 'active income' : ''} 
                  onClick={() => setType('income')}
                >
                  Income
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Category Tag</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select">
                {type === 'expense' ? (
                  <>
                    <option value="Food">🥑 Food & Dining</option>
                    <option value="Groceries">🛒 Groceries</option>
                    <option value="Rent">🏠 Rent & Housing</option>
                    <option value="Utilities">⚡ Bills & Utilities</option>
                    <option value="Transport">🚗 Fuel & Transport</option>
                    <option value="Shopping">🛍️ Shopping</option>
                    <option value="Entertainment">🎬 Entertainment & Leisure</option>
                    <option value="Medical">💊 Healthcare & Medical</option>
                    <option value="Education">📚 Education & Learning</option>
                    <option value="Investments_Out">📈 Investments</option>
                    <option value="Others_Out">📦 Others</option>
                  </>
                ) : (
                  <>
                    <option value="Salary">💼 Primary Salary</option>
                    <option value="Freelance">💻 Side Hustles & Freelance</option>
                    <option value="Investments_In">🪙 Investment Returns</option>
                    <option value="Gifts">🎁 Gifts & Grants</option>
                    <option value="Others_In">💰 Others</option>
                  </>
                )}
              </select>
            </div>
            <button 
              type="submit" 
              className="submit-btn record-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Logging..." : "Record Entry"}
            </button>
          </form>
        </section>

        {/* Ledger Activity Stream */}
        <section className="ledger-table-container">
          {/* Controls Bar */}
          <div className="ledger-controls-panel">
            <input 
              type="text" 
              placeholder="🔍 Search entries..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <div className="flow-pill-selectors">
              <button 
                className={`flow-pill ${flowFilter === 'all' ? 'active' : ''}`}
                onClick={() => setFlowFilter('all')}
              >
                All
              </button>
              <button 
                className={`flow-pill ${flowFilter === 'expense' ? 'active' : ''}`}
                onClick={() => setFlowFilter('expense')}
              >
                Expenses
              </button>
              <button 
                className={`flow-pill ${flowFilter === 'income' ? 'active' : ''}`}
                onClick={() => setFlowFilter('income')}
              >
                Income
              </button>
            </div>
          </div>

          <div className="ledger-section-header" style={{ marginTop: '15px' }}>
            <h2>Activity Logs</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isLoading && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Syncing...</span>}
              <span className="count-badge">{finalFilteredTransactions.length} items</span>
            </div>
          </div>

          {/* Table View (Desktop) */}
          <table className="ledger-table desktop-only">
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
              {finalFilteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
                    {isLoading ? "Syncing..." : "No matching financial records found."}
                  </td>
                </tr>
              ) : (
                finalFilteredTransactions.map((t) => (
                  <tr key={t._id}>
                    <td>{new Date(t.date).toLocaleDateString('en-IN')}</td>
                    <td style={{ fontWeight: '500' }}>{t.description}</td>
                    <td><span className="badge-pill">{CATEGORY_MAP[t.category] || t.category}</span></td>
                    <td className={t.type === 'income' ? 'amt-income' : 'amt-expense'}>
                      {t.type === 'income' ? '+' : '-'} ₹{t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => handleDelete(t._id)} className="delete-action-btn">Remove</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Cards View (Mobile/Responsive) */}
          <div className="mobile-only mobile-transaction-list">
            {finalFilteredTransactions.length === 0 ? (
              <div className="mobile-empty-state">
                {isLoading ? "Syncing..." : "No matching financial records found."}
              </div>
            ) : (
              finalFilteredTransactions.map((t) => (
                <div className="mobile-transaction-card" key={t._id}>
                  <div className="card-primary-row">
                    <span className="card-emoji-label">
                      {CATEGORY_MAP[t.category]?.split(' ')[0] || '🪙'}
                    </span>
                    <div className="card-text-group">
                      <h4>{t.description}</h4>
                      <span>
                        {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {CATEGORY_MAP[t.category]?.split(' ').slice(1).join(' ') || t.category}
                      </span>
                    </div>
                    <div className="card-right-group">
                      <span className={`card-amount ${t.type === 'income' ? 'income' : 'expense'}`}>
                        {t.type === 'income' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </span>
                      <button onClick={() => handleDelete(t._id)} className="card-delete-swipe" aria-label="Delete entry">✕</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;