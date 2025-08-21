import { db, auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// DOM elements (keeps your original IDs)
const signupEmail = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");
const signupBtn = document.getElementById("signup-btn");

const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginBtn = document.getElementById("login-btn");

const authSection = document.getElementById("auth-section");
const loggedInContainer = document.getElementById("logged-in-container");

const expenseDesc = document.getElementById("expense-desc");
const expenseDate = document.getElementById("expense-date");
const expenseAmount = document.getElementById("expense-amount");
const addExpenseBtn = document.getElementById("add-expense-btn");
const expensesList = document.getElementById("expenses-list");

const logoutBtn = document.getElementById("logout-btn");

const currentTotalAmount = document.getElementById("current-total-amount");
const currencySelect = document.getElementById("currency-select");
const totalExpensesHeading = document.getElementById("budget-total");

const deleteSelectedBtn = document.getElementById("delete-selected-btn");
const deleteAllBtn = document.getElementById("delete-all-btn");

// Default the date picker to today (local date)
function getTodayForDateInput() {
  const now = new Date();
  const tzOffsetMinutes = now.getTimezoneOffset();
  const localTime = new Date(now.getTime() - tzOffsetMinutes * 60000);
  return localTime.toISOString().slice(0, 10);
}
if (expenseDate) {
  expenseDate.value = getTodayForDateInput();
}

// Auth: signup/login
signupBtn.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(auth, signupEmail.value, signupPassword.value);
    alert("Signup successful!");
  } catch (err) {
    alert(err.message);
  }
});

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
    alert("Login successful!");
  } catch (err) {
    alert(err.message);
  }
});

// Currency & rates
const FRANKFURTER_API_URL = "https://api.frankfurter.app/latest";

// exchangeRates will hold INR-per-1-UNIT (e.g. USD: ~83 means 1 USD = 83 INR)
let exchangeRates = { INR: 1, USD: 83, EUR: 90, GBP: 105 };
let currentCurrency = "INR";
let ratesReady = false;

function getCurrencySymbol(code) {
  switch (code) {
    case "USD": return "$";
    case "EUR": return "€";
    case "GBP": return "£";
    case "INR": return "₹";
    default: return code + " ";
  }
}

// fetch rates: Frankfurter returns (when from=INR) { USD: 0.012 } meaning 1 INR = 0.012 USD
// we convert it to "1 USD = X INR" by inverting (1 / 0.012)
async function fetchExchangeRates() {
  ratesReady = false;
  try {
    const res = await fetch(`${FRANKFURTER_API_URL}?from=INR&to=USD,EUR,GBP`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json(); // data.rates: { USD: x, EUR: y, GBP: z } where x = foreign per 1 INR
    exchangeRates = { INR: 1 };
    // invert safely (if API missing a currency, keep fallback)
    if (data.rates && typeof data.rates.USD === "number") exchangeRates.USD = 1 / data.rates.USD;
    else exchangeRates.USD = exchangeRates.USD || 83;
    if (data.rates && typeof data.rates.EUR === "number") exchangeRates.EUR = 1 / data.rates.EUR;
    else exchangeRates.EUR = exchangeRates.EUR || 90;
    if (data.rates && typeof data.rates.GBP === "number") exchangeRates.GBP = 1 / data.rates.GBP;
    else exchangeRates.GBP = exchangeRates.GBP || 105;

    ratesReady = true;
    console.log("Exchange rates (INR per 1 unit):", exchangeRates);
  } catch (err) {
    console.error("Failed to fetch rates:", err);
    alert("Could not fetch latest currency rates — using defaults.");
    ratesReady = true; // allow UI to run with fallback rates
  }
}

// Convert amount from `fromCode` -> `toCode` using INR as bridge:
// exchangeRates[code] = INR per 1 CODE
// amount_in_INR = amount * exchangeRates[fromCode]
// amount_in_toCode = amount_in_INR / exchangeRates[toCode]
function convertAmount(amount, fromCode, toCode) {
  if (fromCode === toCode) return amount;
  const rFrom = exchangeRates[fromCode] || exchangeRates["INR"];
  const rTo = exchangeRates[toCode] || exchangeRates["INR"];
  if (!isFinite(rFrom) || !isFinite(rTo) || rFrom === 0 || rTo === 0) return NaN;
  return (amount * rFrom) / rTo;
}

// Auth state handling
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authSection.style.display = "none";
    loggedInContainer.style.display = "flex";
    await fetchExchangeRates();
    loadExpenses(user.uid);
  } else {
    authSection.style.display = "block";
    loggedInContainer.style.display = "none";
  }
});

// Add expense — store amount as entered + currency
addExpenseBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return alert("You must be logged in.");
  const amountValue = Number(expenseAmount.value);
  const desc = (expenseDesc.value || "").trim();
  const dateStr = (expenseDate && expenseDate.value) ? expenseDate.value : getTodayForDateInput();

  if (!desc) return alert("Please enter a description.");
  if (isNaN(amountValue) || amountValue <= 0) return alert("Please enter a valid positive amount.");

  try {
    await addDoc(collection(db, "expenses"), {
      uid: user.uid,
      description: desc,
      amount: amountValue,
      date: dateStr,
      currency: currentCurrency,
      timestamp: new Date()
    });
    expenseDesc.value = "";
    expenseAmount.value = "";
    if (expenseDate) expenseDate.value = getTodayForDateInput();
    loadExpenses(user.uid);
  } catch (err) {
    alert(err.message);
  }
});

// Load and render expenses
async function loadExpenses(uid) {
  if (!ratesReady) await fetchExchangeRates();

  expensesList.innerHTML = "";
  const q = query(collection(db, "expenses"), where("uid", "==", uid));
  const querySnapshot = await getDocs(q);

  let totalInSelected = 0;

  if (querySnapshot.empty) {
    deleteSelectedBtn.style.display = "none";
    deleteAllBtn.style.display = "none";
    currentTotalAmount.textContent = `${getCurrencySymbol(currentCurrency)}0`;
    return;
  } else {
    deleteSelectedBtn.style.display = "inline-block";
    deleteAllBtn.style.display = "inline-block";
  }

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const storedCurrency = data.currency || "INR";
    const storedAmount = Number(data.amount) || 0;

    const converted = convertAmount(storedAmount, storedCurrency, currentCurrency);
    totalInSelected += isNaN(converted) ? 0 : converted;

    const li = document.createElement("li");
    li.dataset.id = docSnap.id;
    li.dataset.amount = storedAmount;
    li.dataset.currency = storedCurrency;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("expense-checkbox");
    li.appendChild(checkbox);

    // description + converted amount (show more decimals for tiny values)
    const displayValue = isNaN(converted) ? "—" : (Math.abs(converted) < 1 ? converted.toFixed(4) : converted.toFixed(2));
    li.innerHTML += ` ${data.description} — <span class="expense-amount-display">${getCurrencySymbol(currentCurrency)}${displayValue}</span>`;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🚮";
    deleteBtn.classList.add("delete-btn");

    const updateBtn = document.createElement("button");
    updateBtn.textContent = "✏️";
    updateBtn.classList.add("update-btn");

    li.appendChild(deleteBtn);
    li.appendChild(updateBtn);
    expensesList.appendChild(li);
  });

  currentTotalAmount.textContent = `${getCurrencySymbol(currentCurrency)}${totalInSelected.toFixed(2)}`;
}

// Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// Clicks inside expenses list (delete / update)
expensesList.addEventListener("click", async (e) => {
  const listItem = e.target.closest("li");
  if (!listItem) return;
  const docId = listItem.dataset.id;
  const user = auth.currentUser;
  if (!user) return alert("You must be logged in.");

  if (e.target.classList.contains("delete-btn")) {
    const confirmDelete = confirm("Are you sure you want to delete this expense?");
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, "expenses", docId));
      loadExpenses(user.uid);
    } catch (err) {
      alert("Failed to delete expense: " + err.message);
    }
    return;
  }

  if (e.target.classList.contains("update-btn")) {
    const newAmount = prompt(`Enter new amount in ${currentCurrency} (${getCurrencySymbol(currentCurrency)}):`);
    if (newAmount === null) return; // cancelled
    if (isNaN(Number(newAmount)) || Number(newAmount) < 0) return alert("Invalid amount.");
    try {
      await updateDoc(doc(db, "expenses", docId), {
        amount: Number(newAmount),
        currency: currentCurrency
      });
      loadExpenses(user.uid);
    } catch (err) {
      alert("Failed to update expense: " + err.message);
    }
    return;
  }
});

// Delete selected
deleteSelectedBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return alert("You must be logged in.");
  const checkedBoxes = expensesList.querySelectorAll(".expense-checkbox:checked");
  if (checkedBoxes.length === 0) return alert("Please select at least one expense to delete.");
  const confirmDelete = confirm(`Delete ${checkedBoxes.length} selected expense(s)?`);
  if (!confirmDelete) return;
  const batch = writeBatch(db);
  checkedBoxes.forEach(cb => {
    const item = cb.closest("li");
    const id = item.dataset.id;
    batch.delete(doc(db, "expenses", id));
  });
  try {
    await batch.commit();
    alert("Selected expenses deleted successfully!");
    loadExpenses(user.uid);
  } catch (err) {
    alert("Failed to delete selected expenses: " + err.message);
  }
});

// Delete all
deleteAllBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return alert("You must be logged in.");
  const confirmDelete = confirm("Are you sure you want to delete all your expenses? This cannot be undone.");
  if (!confirmDelete) return;
  try {
    const q = query(collection(db, "expenses"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    if (snap.empty) return alert("No expenses to delete.");
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    alert("All expenses deleted successfully!");
    loadExpenses(user.uid);
  } catch (err) {
    alert("Failed to delete all expenses: " + err.message);
  }
});

// Currency dropdown change
currencySelect.addEventListener("change", async () => {
  currentCurrency = currencySelect.value;
  if (!ratesReady) await fetchExchangeRates();
  if (auth.currentUser) loadExpenses(auth.currentUser.uid);
});

// Calculator logic (unchanged)
const calculator = document.querySelector('.calculator');
const keys = calculator.querySelector('.calculator-keys');
const display = calculator.querySelector('.calculator-screen');

let currentExpression = '';

function updateDisplay() {
  display.value = currentExpression || '0';
}

keys.addEventListener('click', (event) => {
  const { target } = event;
  const { value } = target;

  if (!target.matches('button')) {
    return;
  }

  if (value === 'clear') {
    currentExpression = '';
    updateDisplay();
    return;
  }
  
  if (value === 'backspace') {
      currentExpression = currentExpression.slice(0, -1);
      updateDisplay();
      return;
  }

  if (value === '=') {
    try {
      const result = eval(currentExpression.replace(/×/g, '*').replace(/÷/g, '/'));
      currentExpression = String(result);
      updateDisplay();
    } catch (e) {
      currentExpression = 'Error';
      updateDisplay();
    }
    return;
  }

  if (currentExpression === '0' && !isNaN(value) && value !== '.') {
      currentExpression = value;
  } else {
      currentExpression += value;
  }
  
  updateDisplay();
});
