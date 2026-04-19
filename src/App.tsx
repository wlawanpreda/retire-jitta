/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, Component } from 'react';
import { 
  X, 
  Trash2, 
  Maximize2, 
  Save, 
  Plus, 
  Info, 
  Wallet, 
  Calculator, 
  Dices, 
  ExternalLink, 
  Zap, 
  Target, 
  Calendar, 
  ShieldCheck, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  LogOut, 
  LogIn, 
  AlertTriangle,
  Stethoscope,
  Activity,
  Sparkles,
  Camera,
  ChevronRight,
  ArrowUpRight,
  Send,
  ListChecks,
  MessageSquare,
  ArrowRight,
  Table as TableIcon
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth, db, storage, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  getDocFromServer
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { analyzeInvestmentImage } from './services/geminiService';

import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Types ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const calculateThaiTax = (taxableIncome: number) => {
  if (isNaN(taxableIncome) || taxableIncome <= 0) return 0;
  const brackets = [
    { limit: 150000, rate: 0 },
    { limit: 300000, rate: 0.05 },
    { limit: 500000, rate: 0.10 },
    { limit: 750000, rate: 0.15 },
    { limit: 1000000, rate: 0.20 },
    { limit: 2000000, rate: 0.25 },
    { limit: 5000000, rate: 0.30 },
    { limit: Infinity, rate: 0.35 }
  ];

  let tax = 0;
  let remaining = taxableIncome;
  let prevLimit = 0;

  for (const bracket of brackets) {
    const range = bracket.limit - prevLimit;
    const taxableInRange = Math.min(remaining, range);
    tax += taxableInRange * bracket.rate;
    remaining -= taxableInRange;
    prevLimit = bracket.limit;
    if (remaining <= 0) break;
  }

  return tax;
};

type Language = 'en' | 'th';

interface Investment {
  id: string;
  name: string;
  accountNumber?: string;
  amount: number;
  gainLossAmount?: number;
  gainLossPercentage?: number;
  category: string;
  history?: { date: string; amount: number }[];
  expectedReturn?: number;
}

interface Milestone {
  id: string;
  name: string;
  year: number;
  amount: number;
  type: 'expense' | 'shock';
}

interface TaxSettings {
  taxableIncome: number;
  ssfAmount: number;
  rmfAmount: number;
  reinvestSavings: boolean;
}

const translations = {
  en: {
    title: "Retirement 5% Optimizer",
    concept: "Jitta Wealth Concept",
    plan: "Sustainability Plan",
    inputAnalysis: "Input Analysis",
    monthlyIncome: "Desired Monthly Income",
    currentAge: "Current Age",
    retirementAge: "Retirement Age",
    inflationRate: "Inflation Rate",
    expectedReturn: "Expected Return (Growth)",
    infoBox: "Based on Jitta Wealth's 5% rule. We assume a growth-oriented portfolio to ensure your capital lasts for 30+ years.",
    actionPlan: "Action Plan",
    actionSteps: [
      "Open a Global Equity investment account (e.g., Jitta Ranking or Global ETFs).",
      "Accumulate target capital of {capital} THB.",
      "Set up a separate Cash Buffer account for 2-3 years of expenses.",
      "Perform annual rebalancing to maintain 80/20 allocation."
    ],
    targetCapital: "Target Capital",
    firstYearWithdrawal: "1st Year Withdrawal",
    cashBuffer: "Cash Buffer",
    monthlySavings: "Monthly Savings",
    years: "YEARS",
    portfolioBlueprint: "Portfolio Blueprint",
    growthEngine: "Growth Engine (Global Equity)",
    safetyNet: "Cash Buffer (Safety Net)",
    marketRules: "Market Operational Rules",
    bullMarket: "Bull Market",
    bullDesc: "Sell profits from Growth Engine to refill Cash Buffer. Withdraw as planned.",
    sideways: "Sideways",
    sidewaysDesc: "Withdraw from Cash Buffer first to avoid selling stocks at low prices.",
    bearMarket: "Bear Market",
    bearDesc: "Stop selling stocks. Use Cash Buffer 100%. Reduce discretionary spending by 10%.",
    projection: "30-Year Sustainability Projection",
    accumulationProjection: "Accumulation Phase Projection",
    age: "Age",
    capital: "Capital",
    schedule: "Yearly Withdrawal Schedule",
    year: "Year",
    withdrawal: "Withdrawal",
    remainingCapital: "Remaining Capital",
    start: "Start",
    stressTest: "Stress Test Advice",
    stressTestTitle: "What if the market crashes in Year 1?",
    stressTestDesc: "This system is built for this exact scenario. Your Cash Buffer covers your first 3-4 years of expenses. If the market drops 30% in your first year of retirement, you do not sell any stocks. You live off the buffer until the market recovers, preserving your Growth Engine for long-term sustainability.",
    disclaimer: "Disclaimer: This tool is for educational purposes only and based on the Jitta Wealth 5% rule concept. Investment involves risk. Past performance does not guarantee future results. Consult a financial advisor before making investment decisions.",
    sustainabilityFirst: "Sustainability First",
    thb: "THB",
    thbYr: "THB/YR",
    savingsStrategy: "Savings Strategy",
    currentSavings: "Current Savings",
    accumulationReturn: "Expected Return (Accumulation)",
    monthlySavingsRequired: "Additional Monthly Savings",
    reachTarget: "Reach Target in {years} years",
    accumulationPhase: "Accumulation Phase",
    withdrawalRate: "Withdrawal Rate (%)",
    calculatedTarget: "Calculated Target",
    pessimistic: "Pessimistic",
    baseCase: "Base Case",
    optimistic: "Optimistic",
    scenarioAnalysis: "Scenario Analysis",
    returnRangeInfo: "Market returns vary. Here is the ADDITIONAL amount you need to save each month based on different return scenarios (-2% / Base / +2%).",
    futureMonthlyIncome: "Income {monthlyIncome} {thb}/Month",
    futureMonthlyIncomeDesc: "At age {retirementAge}, its purchasing power will be equivalent to today's",
    yearsToRetireLabel: "Years to Accumulate",
    cashBufferAmount: "Cash Buffer (20%)",
    login: "Login with Google",
    logout: "Logout",
    portfolio: "Investment Portfolio",
    addInvestment: "Add Investment",
    fundName: "Fund Name",
    amount: "Amount",
    gainLoss: "Gain/Loss",
    category: "Category",
    save: "Save",
    delete: "Delete",
    syncing: "Syncing with Cloud...",
    totalPortfolio: "Total Portfolio Value",
    quickImport: "Import from Photos",
    importSuccess: "Data imported successfully!",
    snapshot: "Record Value",
    history: "History",
    noHistory: "No history",
    addHistory: "Add History Entry",
    add: "Add",
    suggestedFeatures: "Suggested Features",
    dividendTracking: "Dividend Tracking",
    rebalancingAlerts: "Rebalancing Alerts",
    goalProgress: "Goal Progress",
    detailedAnalysis: "Detailed Analysis",
    performance: "Performance",
    gainLossTrend: "Gain/Loss Trend",
    valueOverTime: "Value Over Time",
    close: "Close",
    date: "Date",
    sinceStart: "Since Start",
    marketInsights: "Market Insights",
    latestInsights: "Latest Insights from Jitta Wealth",
    readMore: "Read More",
    monteCarloTitle: "Monte Carlo Simulation",
    monteCarloDesc: "1,000 market scenarios simulated",
    successProbability: "Success Probability",
    worstCase: "Worst Case (5th Percentile)",
    medianCase: "Median Case (50th Percentile)",
    simulationInfo: "Simulated based on historical volatility of your asset classes.",
    aiAdvisorTitle: "AI Financial Advisor",
    aiAdvisorDesc: "Personalized insights powered by Gemini",
    askAI: "Ask AI",
    aiThinking: "AI is thinking...",
    aiInsightsTitle: "AI Personalized Insights",
    aiChatPlaceholder: "Ask about your retirement plan...",
    aiDisclaimer: "AI advice is for informational purposes only.",
    monthlySavingsGoal: "Monthly Savings Goal",
    nextSteps: "Next Steps",
    marketPulse: "Market Pulse",
    globalEquity: "Global Equity",
    marketCondition: "Market Condition",
    goalProgressTitle: "Goal Progress",
    estimatedRetirement: "Estimated Retirement Date",
    progressToTarget: "Progress to Target Capital",
    remainingAmount: "Remaining to Goal",
    fearGreedIndex: "Fear & Greed Index",
    marketSentiment: "Market Sentiment",
    economicIndicators: "Economic Indicators",
    lastUpdated: "Last Updated",
    extremeFear: "Extreme Fear",
    fear: "Fear",
    neutral: "Neutral",
    greed: "Greed",
    extremeGreed: "Extreme Greed",
    vixIndex: "VIX Index",
    sp500: "S&P 500",
    us10y: "US 10Y Yield",
    fixedSavingsMode: "What if I save X per month?",
    fixedMonthlySavings: "Fixed Monthly Savings",
    potentialMonthlyIncome: "Potential Monthly Income",
    finalCapital: "Final Capital at Retirement",
    savingsDrivenProjection: "Savings-Driven Projection",
    potentialIncomeDesc: "Estimated monthly income you can withdraw sustainably (5% rule)",
    expectedReturnShort: "Exp. Return",
    healthScore: "Retirement Health Score",
    healthScoreDesc: "Overall strength of your retirement plan",
    progressScore: "Capital Progress",
    savingsScore: "Savings Adequacy",
    allocationScore: "Asset Allocation",
    timeScore: "Time Horizon",
    healthExcellent: "Excellent",
    healthGood: "Good",
    healthFair: "Fair",
    healthAtRisk: "At Risk",
    taxOptimizerTitle: "Tax & Policy Optimizer",
    taxOptimizerDesc: "Maximize your SSF/RMF benefits",
    taxableIncome: "Annual Taxable Income",
    ssfAmount: "SSF Investment",
    rmfAmount: "RMF Investment",
    taxSavings: "Estimated Tax Savings",
    reinvestSavings: "Reinvest Tax Savings",
    reinvestSavingsDesc: "Investing your tax savings can reach your goal {years} years faster.",
    inflationByCategory: "Inflation by Category",
    generalInflation: "General Inflation",
    medicalInflation: "Medical Inflation (Healthcare)",
    medicalInflationDesc: "Healthcare costs typically rise faster than general inflation.",
    lifeMilestones: "Life Milestones & Stress Test",
    addMilestone: "Add Milestone",
    milestoneName: "Milestone Name",
    milestoneYear: "Year (e.g., 2030)",
    milestoneAmount: "Amount",
    milestoneType: "Type",
    majorExpense: "Major Expense",
    healthShock: "Health Shock",
    impactOnGoal: "Impact on Goal",
    milestoneImpactDesc: "This milestone reduces your final capital by {amount} THB.",
    thaiTaxContext: "Thai Tax Context (SSF/RMF)",
    maxSsfLimit: "SSF Limit (30%, max 200k)",
    maxRmfLimit: "RMF Limit (30%, max 300k)",
    totalTaxLimit: "Total Limit (SSF+RMF+Others <= 500k)",
    aiDoctor: "AI Portfolio Doctor",
    aiDoctorDesc: "Comprehensive analysis of your portfolio health",
    assetAllocation: "Asset Allocation",
    allocationPie: "Allocation by Category",
    analysisResult: "Analysis Result",
    riskAssessment: "Risk Assessment",
    recommendations: "Recommendations",
    analyzePortfolio: "Analyze Portfolio Health",
    analyzingPortfolio: "AI is reviewing your portfolio..."
  },
  th: {
    title: "ระบบวางแผนเกษียณ 5%",
    concept: "แนวคิดจาก Jitta Wealth",
    plan: "แผนความยั่งยืน",
    inputAnalysis: "วิเคราะห์ข้อมูล",
    monthlyIncome: "ค่าใช้จ่ายที่ต้องการต่อเดือน",
    currentAge: "อายุปัจจุบัน",
    retirementAge: "อายุเกษียณ",
    inflationRate: "อัตราเงินเฟ้อ",
    expectedReturn: "ผลตอบแทนคาดหวัง (หุ้น)",
    infoBox: "อ้างอิงกฎ 5% ของ Jitta Wealth เราเน้นการจัดพอร์ตแบบเติบโตเพื่อให้เงินต้นของคุณเพียงพอสำหรับ 30 ปีขึ้นไป",
    actionPlan: "แผนการดำเนินการ",
    actionSteps: [
      "เปิดบัญชีลงทุนหุ้นโลก (เช่น Jitta Ranking หรือ Global ETFs)",
      "สะสมเงินต้นเป้าหมายให้ได้ {capital} บาท",
      "ออมเงินเพิ่มเดือนละ {savings} บาท (กรณีฐาน)",
      "สำรองเงินสดแยกไว้สำหรับค่าใช้จ่าย 2-3 ปี",
      "ปรับสมดุลพอร์ตรายปีเพื่อรักษาสัดส่วน 80/20"
    ],
    targetCapital: "เงินต้นเป้าหมาย",
    firstYearWithdrawal: "ยอดถอนปีแรก",
    cashBuffer: "เงินสำรอง",
    monthlySavings: "เงินออมเพิ่มต่อเดือน",
    years: "ปี",
    portfolioBlueprint: "แผนผังการจัดพอร์ต",
    growthEngine: "ส่วนเติบโต (หุ้นโลก)",
    safetyNet: "ส่วนสำรอง (เงินสด/ตราสารหนี้)",
    marketRules: "กฎเหล็กสภาวะตลาด",
    bullMarket: "ตลาดขาขึ้น",
    bullDesc: "ขายกำไรจากส่วนหุ้นมาเติมเงินสำรอง และถอนเงินตามแผนปกติ",
    sideways: "ตลาดคงที่",
    sidewaysDesc: "ใช้เงินจากส่วนสำรองก่อน เพื่อหลีกเลี่ยงการขายหุ้นในราคาต่ำ",
    bearMarket: "ตลาดขาลง",
    bearDesc: "หยุดขายหุ้นโดยเด็ดขาด ใช้เงินสำรอง 100% และลดค่าใช้จ่ายฟุ่มเฟือยลง 10%",
    projection: "ประมาณการความยั่งยืน 30 ปี",
    accumulationProjection: "ประมาณการช่วงสะสมความมั่งคั่ง",
    age: "อายุ",
    capital: "เงินต้น",
    schedule: "ตารางการถอนเงินรายปี",
    year: "ปีที่",
    withdrawal: "ยอดถอน",
    remainingCapital: "เงินต้นคงเหลือ",
    start: "เริ่มต้น",
    stressTest: "คำแนะนำช่วงวิกฤต",
    stressTestTitle: "จะเกิดอะไรขึ้นถ้าตลาดพังในปีแรก?",
    stressTestDesc: "ระบบนี้ถูกออกแบบมาเพื่อสถานการณ์นี้โดยเฉพาะ เงินสำรองของคุณจะครอบคลุมค่าใช้จ่าย 3-4 ปีแรก หากตลาดหุ้นตกลง 30% ในปีแรก คุณไม่ต้องขายหุ้นเลย แต่ให้ใช้เงินจากส่วนสำรองจนกว่าตลาดจะฟื้นตัว เพื่อรักษาเงินต้นส่วนเติบโตไว้ในระยะยาว",
    disclaimer: "คำเตือน: เครื่องมือนี้มีวัตถุประสงค์เพื่อการศึกษาเท่านั้น อ้างอิงแนวคิดกฎ 5% ของ Jitta Wealth การลงทุนมีความเสี่ยง ผลการดำเนินงานในอดีตมิได้เป็นสิ่งยืนยันถึงผลการดำเนินงานในอนาคต ควรปรึกษาที่ปรึกษาทางการเงินก่อนตัดสินใจลงทุน",
    sustainabilityFirst: "เน้นความยั่งยืน",
    thb: "บาท",
    thbYr: "บาท/ปี",
    savingsStrategy: "กลยุทธ์การออมเงิน",
    currentSavings: "เงินออมปัจจุบัน",
    accumulationReturn: "ผลตอบแทนคาดหวัง (ช่วงสะสม)",
    monthlySavingsRequired: "เงินออมที่ต้องเก็บเพิ่มต่อเดือน",
    reachTarget: "ถึงเป้าหมายใน {years} ปี",
    accumulationPhase: "ช่วงสะสมความมั่งคั่ง",
    withdrawalRate: "อัตราการถอนเงิน (%)",
    calculatedTarget: "เป้าหมายที่คำนวณให้",
    pessimistic: "กรณีเลวร้าย",
    baseCase: "กรณีฐาน",
    optimistic: "กรณีดีเยี่ยม",
    scenarioAnalysis: "วิเคราะห์ตามสถานการณ์",
    returnRangeInfo: "ผลตอบแทนตลาดมีความผันผวน นี่คือจำนวนเงินที่คุณต้องออมเพิ่มต่อเดือนตามสถานการณ์ต่างๆ (-2% / ฐาน / +2%)",
    futureMonthlyIncome: "เงิน {monthlyIncome} {thb}/เดือน",
    futureMonthlyIncomeDesc: "ในอายุ {retirementAge} จะมีอำนาจการซื้อคิดเป็นเงินในวันนี้ประมาณ",
    yearsToRetireLabel: "ระยะเวลาสะสมเงิน",
    cashBufferAmount: "เงินสำรอง (20%)",
    login: "เข้าสู่ระบบด้วย Google",
    logout: "ออกจากระบบ",
    portfolio: "พอร์ตการลงทุน",
    addInvestment: "เพิ่มรายการลงทุน",
    fundName: "ชื่อกองทุน/หุ้น",
    amount: "มูลค่าปัจจุบัน",
    gainLoss: "กำไร/ขาดทุน",
    category: "หมวดหมู่",
    save: "บันทึก",
    delete: "ลบ",
    syncing: "กำลังซิงค์ข้อมูล...",
    totalPortfolio: "มูลค่าพอร์ตรวม",
    quickImport: "นำเข้าข้อมูลจากรูปภาพ",
    importSuccess: "นำเข้าข้อมูลเรียบร้อยแล้ว!",
    snapshot: "บันทึกประวัติ",
    history: "ประวัติ",
    noHistory: "ยังไม่มีประวัติ",
    addHistory: "เพิ่มรายการประวัติ",
    add: "เพิ่ม",
    suggestedFeatures: "ฟีเจอร์แนะนำเพิ่มเติม",
    dividendTracking: "ระบบติดตามปันผล",
    rebalancingAlerts: "แจ้งเตือนการปรับพอร์ต",
    goalProgress: "ความคืบหน้าสู่เป้าหมาย",
    detailedAnalysis: "วิเคราะห์รายละเอียด",
    performance: "ผลการดำเนินงาน",
    gainLossTrend: "แนวโน้มกำไร/ขาดทุน",
    valueOverTime: "มูลค่าตามเวลา",
    close: "ปิด",
    date: "วันที่",
    sinceStart: "ตั้งแต่เริ่มต้น",
    marketInsights: "ข้อมูลเชิงลึกของตลาด",
    latestInsights: "ข้อมูลล่าสุดจาก Jitta Wealth",
    readMore: "อ่านเพิ่มเติม",
    monteCarloTitle: "แบบจำลอง Monte Carlo",
    monteCarloDesc: "จำลองสถานการณ์ตลาด 1,000 รูปแบบ",
    successProbability: "โอกาสสำเร็จ",
    worstCase: "กรณีเลวร้ายที่สุด (เปอร์เซ็นไทล์ที่ 5)",
    medianCase: "กรณีทั่วไป (เปอร์เซ็นไทล์ที่ 50)",
    simulationInfo: "จำลองจากความผันผวนย้อนหลังของสินทรัพย์ในพอร์ตของคุณ",
    aiAdvisorTitle: "ที่ปรึกษาการเงิน AI",
    aiAdvisorDesc: "วิเคราะห์แผนของคุณด้วยพลังของ Gemini",
    askAI: "ถาม AI",
    aiThinking: "AI กำลังวิเคราะห์...",
    aiInsightsTitle: "คำแนะนำส่วนตัวจาก AI",
    aiChatPlaceholder: "ถามเกี่ยวกับแผนเกษียณของคุณ...",
    aiDisclaimer: "คำแนะนำจาก AI เป็นเพียงข้อมูลประกอบการตัดสินใจเท่านั้น",
    monthlySavingsGoal: "เป้าหมายเงินออมต่อเดือน",
    nextSteps: "ขั้นตอนถัดไป",
    marketPulse: "ชีพจรตลาด",
    globalEquity: "หุ้นโลก",
    marketCondition: "สภาวะตลาด",
    goalProgressTitle: "ความคืบหน้าสู่เป้าหมาย",
    estimatedRetirement: "วันที่คาดว่าจะเกษียณได้จริง",
    progressToTarget: "ความคืบหน้าเทียบกับเงินต้นเป้าหมาย",
    remainingAmount: "จำนวนเงินที่ยังขาดอยู่",
    fearGreedIndex: "ดัชนีความกลัวและความโลภ",
    marketSentiment: "ความเชื่อมั่นตลาด",
    economicIndicators: "ตัวชี้วัดเศรษฐกิจ",
    lastUpdated: "อัปเดตล่าสุด",
    extremeFear: "กลัวสุดขีด",
    fear: "กลัว",
    neutral: "ปกติ",
    greed: "โลภ",
    extremeGreed: "โลภสุดขีด",
    vixIndex: "ดัชนี VIX",
    sp500: "S&P 500",
    us10y: "บอนด์ยีลด์สหรัฐฯ 10 ปี",
    fixedSavingsMode: "ถ้าฉันออมเดือนละ X บาท",
    fixedMonthlySavings: "เงินออมรายเดือนคงที่",
    potentialMonthlyIncome: "รายได้ต่อเดือนที่คาดว่าจะได้รับ",
    finalCapital: "เงินต้น ณ วันเกษียณ",
    savingsDrivenProjection: "ประมาณการตามยอดเงินออม",
    potentialIncomeDesc: "รายได้ต่อเดือนที่คุณสามารถถอนมาใช้ได้อย่างยั่งยืน (กฎ 5%)",
    expectedReturnShort: "ผลตอบแทนคาดหวัง",
    healthScore: "คะแนนสุขภาพแผนเกษียณ",
    healthScoreDesc: "ความแข็งแรงโดยรวมของแผนการเกษียณของคุณ",
    progressScore: "ความคืบหน้าเงินต้น",
    savingsScore: "ความเพียงพอของเงินออม",
    allocationScore: "การจัดสรรสินทรัพย์",
    timeScore: "ระยะเวลาที่เหลือ",
    healthExcellent: "ยอดเยี่ยม",
    healthGood: "ดี",
    healthFair: "พอใช้",
    healthAtRisk: "ควรปรับปรุง",
    taxOptimizerTitle: "วางแผนภาษี (SSF / RMF)",
    taxOptimizerDesc: "ใช้สิทธิลดหย่อนภาษีให้คุ้มค่าที่สุด",
    taxableIncome: "รายได้ต่อปี (หลังหักค่าใช้จ่าย)",
    ssfAmount: "ลงทุน SSF",
    rmfAmount: "ลงทุน RMF",
    taxSavings: "ภาษีที่ประหยัดได้",
    reinvestSavings: "นำภาษีที่ประหยัดได้ไปลงทุนต่อ",
    reinvestSavingsDesc: "การนำเงินภาษีที่ประหยัดได้ไปลงทุนต่อ จะช่วยให้ถึงเป้าหมายเร็วขึ้น {years} ปี",
    inflationByCategory: "เงินเฟ้อแยกตามหมวดหมู่",
    generalInflation: "เงินเฟ้อทั่วไป",
    medicalInflation: "เงินเฟ้อค่ารักษาพยาบาล",
    medicalInflationDesc: "ค่ารักษาพยาบาลมักจะเพิ่มขึ้นเร็วกว่าเงินเฟ้อทั่วไป",
    lifeMilestones: "เหตุการณ์สำคัญและการทดสอบภาวะวิกฤต",
    addMilestone: "เพิ่มเหตุการณ์",
    milestoneName: "ชื่อเหตุการณ์",
    milestoneYear: "ปีที่เกิด (เช่น 2570)",
    milestoneAmount: "จำนวนเงิน",
    milestoneType: "ประเภท",
    majorExpense: "ค่าใช้จ่ายก้อนใหญ่",
    healthShock: "วิกฤตสุขภาพ",
    impactOnGoal: "ผลกระทบต่อเป้าหมาย",
    milestoneImpactDesc: "เหตุการณ์นี้จะทำให้เงินต้นคงเหลือลดลง {amount} บาท",
    thaiTaxContext: "เงื่อนไขภาษีไทย (SSF/RMF)",
    maxSsfLimit: "สิทธิ์ SSF (30% ไม่เกิน 2 แสน)",
    maxRmfLimit: "สิทธิ์ RMF (30% ไม่เกิน 3 แสน)",
    totalTaxLimit: "สิทธิ์รวม (SSF+RMF+อื่นๆ ไม่เกิน 5 แสน)"
  }
};

interface CalculationResult {
  targetCapital: number;
  firstYearWithdrawal: number;
  growthEngine: number;
  cashBuffer: number;
  cashBufferYears: number;
  cashBufferAmount: number;
  futureMonthlyIncome: number;
  futurePurchasingPower: number;
  requiredMonthlySavings: number;
  scenarios: {
    pessimistic: number;
    base: number;
    optimistic: number;
  };
  yearsToRetire: number;
  accumulationProjections: {
    year: number;
    age: number;
    capital: number;
  }[];
  yearlyProjections: {
    year: number;
    age: number;
    withdrawal: number;
    remainingCapital: number;
  }[];
  fixedSavingsResult: {
    finalCapital: number;
    potentialMonthlyIncome: number;
    projections: { age: number; capital: number }[];
  };
  healthScore: {
    total: number;
    progress: number;
    savings: number;
    allocation: number;
    time: number;
    label: string;
    color: string;
  };
  taxSavings: number;
  yearsSavedByTaxReinvestment: number;
}

const DetailedInvestmentModal = ({ 
  investment, 
  onClose, 
  onAddHistory,
  onDeleteHistory,
  t,
  lang
}: { 
  investment: Investment, 
  onClose: () => void, 
  onAddHistory: (amount: number, date: string) => Promise<void>,
  onDeleteHistory: (uId: string) => Promise<void>,
  t: any,
  lang: string
}) => {
  const [newAmount, setNewAmount] = useState<string>(investment.amount.toString());
  const [newDate, setNewDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isAdding, setIsAdding] = useState(false);

  const historyData = useMemo(() => {
    if (!investment.history || investment.history.length === 0) return [];
    
    const firstAmount = investment.history[0].amount;
    return investment.history.map((h, originalIndex) => {
      const gainLoss = h.amount - firstAmount;
      const gainLossPct = firstAmount !== 0 ? (gainLoss / firstAmount) * 100 : 0;
      
      return {
        ...h,
        displayDate: new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        gainLoss,
        gainLossPct: Math.round(gainLossPct * 100) / 100
      };
    });
  }, [investment.history]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-orange-900/40 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 border-b border-orange-100 flex justify-between items-center bg-orange-50/30">
          <div>
            <h2 className="text-2xl font-bold text-orange-900 tracking-tight">{investment.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">{t.detailedAnalysis}</span>
              <div className="w-1 h-1 rounded-full bg-orange-200" />
              <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">
                {investment.category === 'Global Equity' ? t.growthEngine : t.safetyNet}
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 text-orange-300 hover:text-orange-600 hover:bg-orange-100 rounded-2xl transition-all active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-orange-50/50 rounded-3xl border border-orange-100/50">
              <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2">{t.amount}</p>
              <p className="text-3xl font-bold font-mono text-orange-900">
                {investment.amount.toLocaleString()} <span className="text-sm font-medium text-orange-300 ml-1">THB</span>
              </p>
            </div>
            <div className="p-6 bg-emerald-50/50 rounded-3xl border border-emerald-100/50">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">{t.performance}</p>
              <div className="flex items-baseline gap-2">
                <p className={cn(
                  "text-3xl font-bold font-mono",
                  (historyData[historyData.length - 1]?.gainLossPct || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {historyData.length > 0 ? (historyData[historyData.length - 1].gainLossPct >= 0 ? '+' : '') : ''}
                  {historyData.length > 0 ? historyData[historyData.length - 1].gainLossPct : 0}%
                </p>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-tighter">
                  {t.sinceStart}
                </span>
              </div>
            </div>
            <div className="p-6 bg-orange-600 rounded-3xl shadow-lg shadow-orange-200">
              <p className="text-[10px] font-bold text-orange-100 uppercase tracking-widest mb-2">{t.category}</p>
              <p className="text-xl font-bold text-white">
                {investment.category === 'Global Equity' ? t.growthEngine : t.safetyNet}
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-8">
            <div className="bg-white p-6 rounded-3xl border border-orange-100">
              <h3 className="text-xs font-bold text-orange-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-orange-600" />
                </div>
                {t.valueOverTime}
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ea580c" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#fef3c7" />
                    <XAxis 
                      dataKey="displayDate" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#9a3412', fontWeight: 600 }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#9a3412', fontWeight: 600 }}
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)', padding: '12px 16px' }}
                      itemStyle={{ fontWeight: 700, fontSize: '12px' }}
                      labelStyle={{ fontWeight: 800, color: '#9a3412', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#ea580c" 
                      strokeWidth={4} 
                      fillOpacity={1} 
                      fill="url(#colorAmount)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-orange-100">
              <h3 className="text-xs font-bold text-orange-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <PieChartIcon className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                {t.gainLossTrend} (%)
              </h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient id="colorGainLoss" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#fef3c7" />
                    <XAxis 
                      dataKey="displayDate" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#9a3412', fontWeight: 600 }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#9a3412', fontWeight: 600 }}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)', padding: '12px 16px' }}
                      itemStyle={{ fontWeight: 700, fontSize: '12px' }}
                      labelStyle={{ fontWeight: 800, color: '#9a3412', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="gainLossPct" 
                      stroke="#10b981" 
                      strokeWidth={4} 
                      fillOpacity={1} 
                      fill="url(#colorGainLoss)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* History Log Table */}
          <div className="bg-white p-6 rounded-3xl border border-orange-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-xs font-bold text-orange-900 uppercase tracking-widest flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center">
                  <TableIcon className="w-3.5 h-3.5 text-orange-600" />
                </div>
                {t.history}
              </h3>

              <div className="flex items-center gap-2 bg-orange-50/50 p-2 rounded-2xl border border-orange-100">
                <input 
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-orange-900 focus:outline-none w-28"
                />
                <div className="w-px h-4 bg-orange-200" />
                <input 
                  type="number"
                  placeholder={t.amount}
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-orange-900 focus:outline-none w-20 px-1"
                />
                <button 
                  onClick={async () => {
                    if (!newAmount || isAdding) return;
                    setIsAdding(true);
                    try {
                      await onAddHistory(Number(newAmount), newDate);
                      setNewAmount(''); // Clear amount after success
                      alert(lang === 'th' ? 'เพิ่มสำเร็จ!' : 'Added successfully!');
                    } catch (e) {
                      // Error handled by re-throwing and global handler
                    } finally {
                      setIsAdding(false);
                    }
                  }}
                  disabled={isAdding}
                  className="w-6 h-6 rounded-lg bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 transition-colors disabled:opacity-50"
                  title={t.add}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-orange-50">
                    <th className="pb-4 text-[10px] font-bold text-orange-300 uppercase tracking-widest">{t.date}</th>
                    <th className="pb-4 text-[10px] font-bold text-orange-300 uppercase tracking-widest text-right">{t.amount}</th>
                    <th className="pb-4 text-[10px] font-bold text-orange-300 uppercase tracking-widest text-right">{t.growth}</th>
                    <th className="pb-4 text-[10px] font-bold text-orange-300 uppercase tracking-widest text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {historyData.slice().reverse().map((entry, idx) => (
                    <tr key={idx} className="hover:bg-orange-50/50 transition-colors group">
                      <td className="py-4 text-xs font-bold text-orange-900">
                        {new Date(entry.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </td>
                      <td className="py-4 text-xs font-mono font-bold text-orange-600 text-right">
                        {entry.amount.toLocaleString()} <span className="text-[10px] text-orange-300">THB</span>
                      </td>
                      <td className={cn(
                        "py-4 text-xs font-bold text-right",
                        entry.gainLossPct >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {entry.gainLossPct >= 0 ? '+' : ''}{entry.gainLossPct}%
                      </td>
                      <td className="py-4 text-right">
                        <button 
                          onClick={() => onDeleteHistory(entry.uId || (entry.date + entry.amount))}
                          className="p-2 text-orange-200 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {historyData.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-zinc-300 text-xs font-bold uppercase tracking-widest">
                        {t.noHistory}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// --- Constants ---

const MARKET_INSIGHTS = [
  {
    id: 1,
    title: { en: "Global Equity Outlook 2024", th: "แนวโน้มหุ้นโลกปี 2024" },
    description: { 
      en: "Tech sectors continue to lead growth, while emerging markets show value potential.",
      th: "กลุ่มเทคโนโลยีส่อแววเติบโตต่อเนื่อง ขณะที่ตลาดเกิดใหม่เริ่มเห็นมูลค่าที่น่าสนใจ"
    },
    tag: "Market Update",
    date: "2024-04-08",
    url: "https://jittawealth.com/blog"
  },
  {
    id: 2,
    title: { en: "The Power of the 5% Rule", th: "พลังของกฎ 5% ในการเกษียณ" },
    description: {
      en: "How a disciplined withdrawal strategy preserves your capital during bear markets.",
      th: "กลยุทธ์การถอนเงินอย่างมีวินัยช่วยรักษาเงินต้นของคุณในช่วงตลาดขาลงได้อย่างไร"
    },
    tag: "Strategy",
    date: "2024-04-05",
    url: "https://jittawealth.com/blog"
  }
];

const MarketPulse = ({ t, lang }: { t: any, lang: string }) => {
  const [fng, setFng] = useState<{ value: number, classification: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFng = async () => {
      try {
        const res = await fetch('https://api.alternative.me/fng/');
        const data = await res.json();
        if (data.data && data.data[0]) {
          setFng({
            value: Number(data.data[0].value),
            classification: data.data[0].value_classification
          });
        }
      } catch (err) {
        console.error("Failed to fetch F&G index", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFng();
  }, []);

  const getFngColor = (value: number) => {
    if (value < 25) return 'bg-rose-500';
    if (value < 45) return 'bg-orange-500';
    if (value < 55) return 'bg-zinc-400';
    if (value < 75) return 'bg-emerald-500';
    return 'bg-blue-500';
  };

  const getFngLabel = (classification: string) => {
    const map: Record<string, string> = {
      'Extreme Fear': t.extremeFear,
      'Fear': t.fear,
      'Neutral': t.neutral,
      'Greed': t.greed,
      'Extreme Greed': t.extremeGreed
    };
    return map[classification] || classification;
  };

  return (
    <div className="bg-white/40 backdrop-blur-xl border border-white/40 rounded-[2.5rem] p-5 sm:p-8 shadow-2xl shadow-orange-900/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Zap className="w-48 h-48 text-orange-600" />
      </div>

      <div className="relative z-10 space-y-8">
        <div className="flex flex-col md:flex-row gap-12">
          {/* Fear & Greed Section */}
          <div className="flex-1 space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-600/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-orange-900 uppercase tracking-widest">{t.marketPulse}</h3>
                  <p className="text-[10px] font-medium text-orange-600/60 uppercase tracking-widest">{t.fearGreedIndex}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-bold text-zinc-300 uppercase tracking-widest block">{t.lastUpdated}</span>
                <span className="text-[9px] font-bold text-zinc-400 font-mono">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>

            {loading ? (
              <div className="h-44 flex items-center justify-center bg-zinc-50/50 rounded-3xl border border-zinc-100/50 animate-pulse">
                <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : fng ? (
              <div className="space-y-6">
                <div className="relative pt-8 px-2">
                  <div className="flex justify-between text-[9px] font-bold text-zinc-400 mb-4 uppercase tracking-[0.2em] px-1">
                    <span className="text-rose-500">{t.extremeFear}</span>
                    <span className="text-zinc-400">{t.neutral}</span>
                    <span className="text-blue-500">{t.extremeGreed}</span>
                  </div>
                  <div className="h-3 bg-zinc-100 rounded-full overflow-hidden flex p-0.5 shadow-inner border border-zinc-200/50">
                    <div className="h-full bg-rose-500 w-[25%] rounded-l-full" />
                    <div className="h-full bg-orange-400 w-[20%]" />
                    <div className="h-full bg-zinc-300 w-[10%]" />
                    <div className="h-full bg-emerald-400 w-[20%]" />
                    <div className="h-full bg-blue-500 w-[25%] rounded-r-full" />
                  </div>
                  {/* Needle - Hardware look */}
                  <motion.div 
                    initial={{ left: '50%' }}
                    animate={{ left: `${fng.value}%` }}
                    transition={{ type: "spring", stiffness: 40, damping: 12 }}
                    className="absolute top-11 w-1 h-8 bg-zinc-900 rounded-full shadow-2xl z-10"
                    style={{ transform: 'translateX(-50%)' }}
                  >
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-zinc-900 rounded-full border-[3px] border-white shadow-xl" />
                  </motion.div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/50 border border-white p-6 rounded-[2rem] shadow-sm flex flex-col items-center justify-center gap-1 group/score hover:bg-white transition-colors">
                    <div className={cn("px-4 py-1 rounded-xl text-[10px] font-bold text-white shadow-lg uppercase tracking-widest transition-transform group-hover/score:scale-105", getFngColor(fng.value))}>
                      {getFngLabel(fng.classification)}
                    </div>
                  </div>
                  <div className="bg-zinc-900 p-6 rounded-[2rem] shadow-xl flex flex-col items-center justify-center gap-1">
                    <span className="text-4xl font-bold font-mono text-white tracking-tighter">{fng.value}</span>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Points</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center bg-rose-50 rounded-3xl border border-rose-100">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">Failed to load index</span>
              </div>
            )}
          </div>

          {/* Economic Indicators Section */}
          <div className="flex-1 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-widest">{t.economicIndicators}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: t.vixIndex, val: '14.25', change: '-2.4%', up: false, neu: false },
                { label: t.sp500, val: '5,204.3', change: '+0.8%', up: true, neu: false },
                { label: t.us10y, val: '4.32%', change: '+1.2%', up: true, neu: false },
                { label: 'USD/THB', val: '36.45', change: '0.0%', up: false, neu: true }
              ].map((item, idx) => (
                <div key={idx} className="p-6 bg-white/40 border border-white hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all rounded-[2rem] group/item">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 group-hover/item:text-blue-600 transition-colors">{item.label}</p>
                  <div className="flex flex-col gap-1">
                    <span className="text-2xl font-bold text-zinc-900 font-mono tracking-tighter leading-none">{item.val}</span>
                    <span className={cn(
                      "text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg w-fit mt-2",
                      item.neu ? "bg-zinc-100 text-zinc-500" : (item.up ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")
                    )}>
                      {item.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Components ---

// --- Components ---

interface InvestmentCardProps {
  inv: Investment;
  t: any;
  updateInvestment: (id: string, updates: any) => any;
  recordInvestmentHistory: (id: string, amount: number) => any;
  deleteInvestment: (id: string) => any;
  setSelectedInvestment: (inv: Investment) => void;
  accumulationReturn: number;
}

const InvestmentCard = ({ 
  inv, 
  t, 
  updateInvestment, 
  recordInvestmentHistory, 
  deleteInvestment, 
  setSelectedInvestment, 
  accumulationReturn 
}: any) => {
  const [localName, setLocalName] = useState(inv.name);
  const [localAmount, setLocalAmount] = useState(inv.amount);
  const [localReturn, setLocalReturn] = useState(inv.expectedReturn ?? accumulationReturn);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    setLocalName(inv.name);
  }, [inv.name]);

  useEffect(() => {
    setLocalAmount(inv.amount);
  }, [inv.amount]);

  useEffect(() => {
    setLocalReturn(inv.expectedReturn ?? accumulationReturn);
  }, [inv.expectedReturn, accumulationReturn]);

  const handleRecord = async () => {
    setIsRecording(true);
    await recordInvestmentHistory(inv.id, inv.amount);
    setTimeout(() => setIsRecording(false), 2000);
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="p-4 bg-white border border-orange-100 rounded-2xl hover:border-orange-300 hover:shadow-xl hover:shadow-orange-500/5 transition-all group relative overflow-hidden"
    >
      {/* Category Accent Bar */}
      <div className={cn(
        "absolute top-0 left-0 w-1.5 h-full",
        inv.category === 'Global Equity' ? "bg-orange-500" : "bg-emerald-500"
      )} />

      <div className="space-y-5">
        <div className="flex justify-between items-start pl-2">
          <div className="flex-1 min-w-0">
            <input 
              className="text-lg font-bold text-orange-900 bg-transparent border-none focus:ring-0 p-0 w-full truncate placeholder:text-orange-200 tracking-tight"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => updateInvestment(inv.id, { name: localName })}
              placeholder={t.fundName}
            />
            <div className="flex items-center gap-2 mt-1">
              <div className={cn(
                "px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest",
                inv.category === 'Global Equity' ? "bg-orange-100 text-orange-600" : "bg-emerald-100 text-emerald-600"
              )}>
                {inv.category === 'Global Equity' ? t.growthEngine : t.safetyNet}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 bg-orange-50/50 p-1 rounded-xl">
            <button 
              onClick={() => setSelectedInvestment(inv)}
              className="p-2 text-orange-400 hover:text-orange-600 hover:bg-white rounded-lg transition-all shadow-sm active:scale-90"
              title={t.detailedAnalysis}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button 
              onClick={handleRecord}
              disabled={isRecording}
              className={cn(
                "p-2 rounded-lg transition-all shadow-sm active:scale-90",
                isRecording ? "text-emerald-600 bg-emerald-50" : "text-emerald-400 hover:text-emerald-600 hover:bg-white"
              )}
              title={t.snapshot}
            >
              {isRecording ? <ShieldCheck className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => deleteInvestment(inv.id)}
              className="p-2 text-orange-200 hover:text-rose-500 hover:bg-white rounded-lg transition-all shadow-sm active:scale-90"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 pl-2">
          <div className="w-full sm:flex-1">
            <p className="text-[10px] font-bold text-orange-300 uppercase tracking-[0.2em] mb-2">{t.amount}</p>
            <div className="relative group/input">
              <input 
                type="number"
                className="w-full text-2xl font-mono font-bold text-orange-600 bg-transparent border-b-2 border-orange-50 focus:border-orange-200 focus:ring-0 p-0 pb-1 transition-all"
                value={localAmount}
                onChange={(e) => setLocalAmount(Number(e.target.value))}
                onBlur={() => updateInvestment(inv.id, { amount: localAmount })}
              />
              <span className="absolute right-0 bottom-2 text-[10px] text-orange-300 font-bold uppercase tracking-widest">THB</span>
            </div>
          </div>
          
          {/* Mini History Chart - Clickable */}
          <button 
            onClick={() => setSelectedInvestment(inv)}
            className="w-full sm:w-32 h-16 flex flex-col justify-end shrink-0 bg-orange-50/30 rounded-xl p-2 border border-orange-100/50 text-left hover:border-orange-300 hover:bg-orange-100/30 transition-all group/history"
          >
            <div className="h-10 relative">
              {inv.history && inv.history.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={inv.history}>
                    <defs>
                      <linearGradient id={`gradient-${inv.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fb923c" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#fb923c" 
                      strokeWidth={2} 
                      dot={inv.history.length === 1} 
                      animationDuration={1500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-orange-200 rounded-lg group-hover/history:border-orange-400">
                  <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest group-hover/history:text-orange-500 transition-colors">{t.noHistory}</span>
                </div>
              )}
            </div>
            <p className="text-[8px] text-orange-400 font-bold uppercase mt-1 text-center tracking-widest opacity-60 flex items-center justify-center gap-1 group-hover/history:opacity-100">
              {t.history} <ArrowUpRight className="w-2 h-2" />
            </p>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 pl-2">
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold text-orange-300 uppercase tracking-widest">Category</p>
            <select 
              className="w-full text-[10px] font-bold text-orange-600 bg-orange-50/50 border border-orange-100/50 rounded-xl px-3 py-2 focus:ring-2 focus:ring-orange-500/10 cursor-pointer hover:bg-orange-100/50 transition-all outline-none"
              value={inv.category}
              onChange={(e) => updateInvestment(inv.id, { category: e.target.value })}
            >
              <option value="Global Equity">📈 {t.growthEngine}</option>
              <option value="Cash/Fixed Income">🛡️ {t.safetyNet}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">{t.expectedReturnShort}</p>
            <div className="relative group/input">
              <input 
                type="number"
                className="w-full text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50/50 border border-emerald-100/50 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none"
                value={localReturn}
                onChange={(e) => setLocalReturn(Number(e.target.value))}
                onBlur={() => updateInvestment(inv.id, { expectedReturn: localReturn })}
                placeholder={t.expectedReturnShort}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 font-bold">%</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const AssetAllocationChart = ({ investments, t }: { investments: Investment[], t: any }) => {
  const data = useMemo(() => {
    const categories: Record<string, number> = {};
    investments.forEach(inv => {
      const cat = inv.category || 'Global Equity';
      categories[cat] = (categories[cat] || 0) + inv.amount;
    });
    
    return Object.entries(categories).map(([name, value]) => ({ 
      name: name === 'Global Equity' ? t.growthEngine : t.safetyNet, 
      value 
    }));
  }, [investments, t]);

  const COLORS = ['#ea580c', '#3b82f6', '#10b981', '#f59e0b'];

  return (
    <Card className="h-full border-zinc-100 shadow-md">
       <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 flex items-center justify-center">
          <PieChartIcon className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">{t.assetAllocation}</h3>
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">{t.allocationPie}</p>
        </div>
      </div>
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <RechartsTooltip 
              contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)', padding: '12px 16px' }}
              itemStyle={{ fontWeight: 700, fontSize: '12px' }}
            />
            <RechartsLegend verticalAlign="bottom" height={36}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

const AIPortfolioDoctor = ({ investments, age, t, lang }: { investments: Investment[], age: number, t: any, lang: string }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const analyze = async () => {
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const portfolioText = investments.map(inv => `${inv.name}: ${inv.amount} THB (${inv.category})`).join('\n');
      const prompt = `
        You are "AI Portfolio Doctor", an expert financial advisor specializing in Thai retirement planning and the Jitta Wealth 5% rule.
        Analyze this portfolio for a person aged ${age}:
        
        Portfolio Data:
        ${portfolioText}
        
        Provide analysis in ${lang === 'th' ? 'Thai' : 'English'} including:
        1. Risk Assessment (Low/Medium/High)
        2. Diversification analysis
        3. Recommendation for age ${age}
        4. Strategy alignment with the 5% rule.
        
        Keep it concise, professional, and encouraging. Focus on "Sustainability First".
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      setAnalysis(response.text || "No analysis generated.");
    } catch (error) {
      console.error("AI Analysis failed", error);
      setAnalysis("Failed to generate analysis. Please ensure you have a valid Internet connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="relative overflow-hidden group border-zinc-100 shadow-md">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Activity className="w-48 h-48 text-rose-600" />
      </div>
      
      <div className="relative z-10 space-y-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/10 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-widest">{t.aiDoctor}</h3>
              <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">{t.aiDoctorDesc}</p>
            </div>
          </div>
          <button
            onClick={analyze}
            disabled={isLoading || investments.length === 0}
            className={cn(
              "px-6 py-2 bg-rose-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50",
              isLoading && "animate-pulse"
            )}
          >
            {isLoading ? t.analyzingPortfolio : t.analyzePortfolio}
          </button>
        </div>

        {analysis ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-rose-50/50 rounded-3xl border border-rose-100/50 space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold text-rose-900 uppercase tracking-tight">{t.analysisResult}</span>
            </div>
            <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap font-medium">
              {analysis}
            </div>
          </motion.div>
        ) : (
          <div className="h-24 flex items-center justify-center border-2 border-dashed border-zinc-100 rounded-3xl">
             <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Ready to analyze your portfolio</span>
          </div>
        )}
      </div>
    </Card>
  );
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState;
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || "");
        if (parsed.error && parsed.operationType) {
          displayMessage = `Firestore Error: ${parsed.operationType} failed on ${parsed.path}. ${parsed.error}`;
        }
      } catch (e) {
        displayMessage = this.state.errorInfo || displayMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-rose-100 text-center">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 mb-2">Application Error</h2>
            <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
              {displayMessage}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Card = ({ children, className, title, icon: Icon, ...props }: { children: React.ReactNode, className?: string, title?: string, icon?: any, [key: string]: any }) => (
  <div className={cn("bg-white border border-orange-100 rounded-2xl p-5 sm:p-6 shadow-sm", className)} {...props}>
    {title && (
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-5 h-5 text-orange-400" />}
        <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400">{title}</h3>
      </div>
    )}
    {children}
  </div>
);

const InputField = ({ label, value, onChange, type = "number", suffix, step, disabled }: { label: string, value: number, onChange: (val: number) => void, type?: string, suffix?: string, step?: number, disabled?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-orange-400 uppercase tracking-tight">{label}</label>
    <div className="relative">
      <input
        type={type}
        value={isNaN(value) ? '' : (typeof value === 'number' ? Math.round(value * 100) / 100 : value)}
        onChange={(e) => {
          const val = e.target.value === '' ? 0 : Number(e.target.value);
          if (!isNaN(val)) onChange(val);
        }}
        step={step}
        disabled={disabled}
        className={cn(
          "w-full bg-orange-50/50 border border-orange-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition-all font-mono",
          disabled && "opacity-50 cursor-not-allowed bg-orange-100/30"
        )}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-orange-300 font-medium">{suffix}</span>
      )}
    </div>
  </div>
);

export default function App() {
  // --- Persistence ---
  const STORAGE_KEY = 'jitta_retirement_config';

  // --- Auth & Firestore State ---
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiInsights, setAiInsights] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');

  const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // --- State ---
  const [lang, setLang] = useState<Language>('th');
  const [monthlyIncome, setMonthlyIncome] = useState(40000);
  const [currentAge, setCurrentAge] = useState(45);
  const [retirementAge, setRetirementAge] = useState(60);
  const [inflationRate, setInflationRate] = useState(3);
  const [expectedReturn, setExpectedReturn] = useState(8);
  const [currentSavings, setCurrentSavings] = useState(0);
  const [accumulationReturn, setAccumulationReturn] = useState(10);
  const [withdrawalRate, setWithdrawalRate] = useState(5);
  const [fixedMonthlySavings, setFixedMonthlySavings] = useState(10000);
  const [medicalInflationRate, setMedicalInflationRate] = useState(6);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    taxableIncome: 1200000,
    ssfAmount: 0,
    rmfAmount: 0,
    reinvestSavings: true
  });
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // --- Auth Listener ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  // --- Firestore Sync (Profile) ---
  useEffect(() => {
    if (!user) {
      // Load from localStorage if not logged in
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.lang) setLang(parsed.lang);
          if (parsed.monthlyIncome) setMonthlyIncome(parsed.monthlyIncome);
          if (parsed.currentAge) setCurrentAge(parsed.currentAge);
          if (parsed.retirementAge) setRetirementAge(parsed.retirementAge);
          if (parsed.inflationRate) setInflationRate(parsed.inflationRate);
          if (parsed.expectedReturn) setExpectedReturn(parsed.expectedReturn);
          if (parsed.currentSavings) setCurrentSavings(parsed.currentSavings);
          if (parsed.accumulationReturn) setAccumulationReturn(parsed.accumulationReturn);
          if (parsed.withdrawalRate) setWithdrawalRate(parsed.withdrawalRate);
          if (parsed.fixedMonthlySavings) setFixedMonthlySavings(parsed.fixedMonthlySavings);
          if (parsed.medicalInflationRate) setMedicalInflationRate(parsed.medicalInflationRate);
          if (parsed.taxSettings) setTaxSettings(parsed.taxSettings);
          if (parsed.milestones) setMilestones(parsed.milestones);
        } catch (e) { console.error("Error parsing local storage", e); }
      }
      return;
    }

    // Sync with Firestore if logged in
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.lang) setLang(data.lang);
        if (data.monthlyIncome) setMonthlyIncome(data.monthlyIncome);
        if (data.currentAge) setCurrentAge(data.currentAge);
        if (data.retirementAge) setRetirementAge(data.retirementAge);
        if (data.inflationRate) setInflationRate(data.inflationRate);
        if (data.expectedReturn) setExpectedReturn(data.expectedReturn);
        if (data.accumulationReturn) setAccumulationReturn(data.accumulationReturn);
        if (data.withdrawalRate) setWithdrawalRate(data.withdrawalRate);
        if (data.fixedMonthlySavings) setFixedMonthlySavings(data.fixedMonthlySavings);
        if (data.medicalInflationRate) setMedicalInflationRate(data.medicalInflationRate);
        if (data.taxSettings) setTaxSettings(data.taxSettings);
      } else {
        // Initialize Firestore with current state if it doesn't exist
        setDoc(userDocRef, {
          lang,
          monthlyIncome,
          currentAge,
          retirementAge,
          inflationRate,
          expectedReturn,
          accumulationReturn,
          withdrawalRate,
          fixedMonthlySavings,
          medicalInflationRate,
          taxSettings,
          updatedAt: new Date().toISOString()
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}`));

    return unsubscribe;
  }, [user]);

  // --- Firestore Sync (Investments) ---
  useEffect(() => {
    if (!user) {
      setInvestments([]);
      return;
    }

    const investmentsRef = collection(db, 'users', user.uid, 'investments');
    const unsubscribe = onSnapshot(investmentsRef, (snapshot) => {
      const items: Investment[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Investment);
      });
      setInvestments(items);
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}/investments`));

    return unsubscribe;
  }, [user]);

  // --- Firestore Sync (Milestones) ---
  useEffect(() => {
    if (!user) {
      return;
    }

    const milestonesRef = collection(db, 'users', user.uid, 'milestones');
    const unsubscribe = onSnapshot(milestonesRef, (snapshot) => {
      const items: Milestone[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Milestone);
      });
      setMilestones(items);
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}/milestones`));

    return unsubscribe;
  }, [user]);

  // --- Sync Selected Investment when list changes ---
  useEffect(() => {
    if (selectedInvestment) {
      const fresh = investments.find(inv => inv.id === selectedInvestment.id);
      if (fresh) {
        setSelectedInvestment(fresh);
      } else {
        setSelectedInvestment(null);
      }
    }
  }, [investments]);

  // --- Connection Test ---
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    };
    testConnection();
  }, []);

  // --- Auto-calculate Current Savings from Investments ---
  useEffect(() => {
    if (user) {
      const total = investments.reduce((sum, inv) => sum + inv.amount, 0);
      setCurrentSavings(Math.round(total * 100) / 100);
    }
  }, [investments, user]);

  // --- Save Profile Changes ---
  const saveProfile = async (updates: any) => {
    if (!user) {
      // Update local storage if not logged in
      const current = {
        lang, monthlyIncome, currentAge, retirementAge, inflationRate, 
        expectedReturn, currentSavings, accumulationReturn, withdrawalRate,
        medicalInflationRate, taxSettings,
        ...updates
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      return;
    }

    setIsSyncing(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Investment Actions ---
  const addInvestment = async () => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'investments'), {
        name: lang === 'th' ? 'การลงทุนใหม่' : 'New Investment',
        amount: 0,
        category: 'Global Equity',
        expectedReturn: accumulationReturn,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/investments`);
    }
  };

  const updateInvestment = async (id: string, updates: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'investments', id), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}/investments/${id}`);
      throw e;
    }
  };

  const recordInvestmentHistory = async (id: string, amount: number, customDate?: string) => {
    if (!user) return;
    const inv = investments.find(i => i.id === id);
    if (!inv) return;

    // Use unique ID for entries to ensure safe deletion even with duplicate dates/amounts
    const newEntry = { 
      uId: Math.random().toString(36).substr(2, 9), 
      date: customDate || new Date().toISOString(), 
      amount 
    };
    
    const newHistory = [...(inv.history || []), newEntry];
    // Sort history by date
    const sortedHistory = newHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // The latest history entry should reflect the current amount
    const latestEntry = sortedHistory[sortedHistory.length - 1];

    try {
      await updateDoc(doc(db, 'users', user.uid, 'investments', id), {
        history: sortedHistory,
        amount: latestEntry.amount, // Sync current amount with the latest history entry
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}/investments/${id}`);
      throw e;
    }
  };

  const deleteInvestmentHistoryEntry = async (investmentId: string, targetId: string) => {
    if (!user) return;
    const inv = investments.find(i => i.id === investmentId);
    if (!inv || !inv.history) return;

    // Filter out by unique ID or fallback to date+amount for legacy entries
    const newHistory = inv.history.filter(h => (h.uId || (h.date + h.amount)) !== targetId);
    
    const sortedHistory = [...newHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // If we have history left, set amount to the latest entry
    const latestAmount = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].amount : inv.amount;

    try {
      await updateDoc(doc(db, 'users', user.uid, 'investments', investmentId), {
        history: sortedHistory,
        amount: latestAmount,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}/investments/${investmentId}`);
      throw e;
    }
  };

  const deleteInvestment = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'investments', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/investments/${id}`);
    }
  };

  const addMilestone = async (type: 'expense' | 'shock') => {
    if (!user) {
      const newM: Milestone = {
        id: Math.random().toString(36).substr(2, 9),
        name: type === 'shock' ? (lang === 'th' ? 'วิกฤตสุขภาพ' : 'Health Shock') : (lang === 'th' ? 'ค่าใช้จ่ายใหม่' : 'New Expense'),
        year: new Date().getFullYear() + (type === 'shock' ? 10 : 5),
        amount: type === 'shock' ? 1000000 : 500000,
        type
      };
      setMilestones(prev => [...prev, newM]);
      return;
    }
    try {
      await addDoc(collection(db, 'users', user.uid, 'milestones'), {
        name: type === 'shock' ? (lang === 'th' ? 'วิกฤตสุขภาพ' : 'Health Shock') : (lang === 'th' ? 'ค่าใช้จ่ายใหม่' : 'New Expense'),
        year: new Date().getFullYear() + (type === 'shock' ? 10 : 5),
        amount: type === 'shock' ? 1000000 : 500000,
        type,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/milestones`);
    }
  };

  const deleteMilestone = async (id: string) => {
    if (!user) {
      setMilestones(prev => prev.filter(m => m.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'milestones', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/milestones/${id}`);
    }
  };

  const importFromPhotos = async () => {
    if (!user) return;
    setIsSyncing(true);
    const photoData = [
      { name: 'Jitta Ranking (CN)', amount: 991302.69, category: 'Global Equity' },
      { name: 'Global ETF (เติบโต)', amount: 475277.60, category: 'Global Equity' },
      { name: 'K-CHANGERMF-P', amount: 286019.42, category: 'Global Equity' },
      { name: 'K-CHINA-SSF', amount: 69933.96, category: 'Global Equity' },
      { name: 'K-CHINARMF', amount: 18971.99, category: 'Global Equity' },
      { name: 'K-JPRMF', amount: 189539.20, category: 'Global Equity' }
    ];

    try {
      for (const item of photoData) {
        await addDoc(collection(db, 'users', user.uid, 'investments'), {
          ...item,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error("Error importing data", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsAnalyzing(true);
    try {
      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `users/${user.uid}/uploads/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      console.log("Image uploaded to:", downloadURL);

      // 2. Convert to base64 for Gemini
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      // 3. Analyze with Gemini
      const extractedData = await analyzeInvestmentImage(base64, file.type);
      
      // 4. Save to Firestore
      for (const item of extractedData) {
        await addDoc(collection(db, 'users', user.uid, 'investments'), {
          ...item,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Error during image upload and analysis:", error);
      alert(lang === 'th' ? 'เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ' : 'Error analyzing image');
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const t = translations[lang];

  // --- Calculations ---
  const results = useMemo((): CalculationResult => {
    // Sanitize inputs
    const mIncome = Number(monthlyIncome) || 0;
    const cAge = Number(currentAge) || 0;
    const rAge = Number(retirementAge) || 0;
    const iRate = Number(inflationRate) || 0;
    const eReturn = Number(expectedReturn) || 0;
    const cSavings = Number(currentSavings) || 0;
    const aReturn = Number(accumulationReturn) || 0;
    const wRate = Number(withdrawalRate) || 0;
    const fSavings = Number(fixedMonthlySavings) || 0;
    const mInflation = Number(medicalInflationRate) || 0;

    const taxableIncome = Number(taxSettings.taxableIncome) || 0;
    const ssfAmount = Number(taxSettings.ssfAmount) || 0;
    const rmfAmount = Number(taxSettings.rmfAmount) || 0;

    // 1. Tax Savings Calculation
    const taxWithoutInvest = calculateThaiTax(taxableIncome);
    const taxWithInvest = calculateThaiTax(taxableIncome - (ssfAmount + rmfAmount));
    const taxSavings = Math.max(0, taxWithoutInvest - taxWithInvest);

    const targetCapital = mIncome * 240;
    const yearlyIncome = targetCapital * (wRate / 100);
    const firstYearWithdrawal = isNaN(yearlyIncome) ? 0 : yearlyIncome;
    
    const yearsToRetire = Math.max(0, rAge - cAge);
    const futureMonthlyIncome = mIncome * Math.pow(1 + iRate / 100, yearsToRetire);
    const futurePurchasingPower = (isNaN(yearsToRetire) || yearsToRetire === 0) ? mIncome : mIncome / Math.pow(1 + iRate / 100, yearsToRetire);

    // Allocation: 80% Growth, 20% Cash Buffer
    const growthEngine = targetCapital * 0.8;
    const cashBuffer = targetCapital * 0.2;
    const cashBufferAmount = cashBuffer;
    const cashBufferYears = (targetCapital > 0 && wRate > 0) 
      ? cashBuffer / (targetCapital * (wRate / 100))
      : 0;

    // Accumulation Phase
    const accumulationProjections = [];
    const r_base = aReturn / 100 / 12;

    const calculatePMT = (returnRate: number) => {
      if (!(yearsToRetire > 0)) return 0;
      const r = (returnRate || 0) / 100 / 12;
      const n = yearsToRetire * 12;
      const fv = targetCapital || 0;
      
      // Calculate growth of existing investments individually
      const pvGrowth = (investments.length > 0)
        ? investments.reduce((sum, inv) => {
            const invReturn = inv.expectedReturn ?? returnRate;
            const r_inv = (invReturn || 0) / 100 / 12;
            return sum + ((inv.amount || 0) * Math.pow(1 + r_inv, n));
          }, 0)
        : ((cSavings || 0) * Math.pow(1 + r, n));

      if (fv <= pvGrowth) return 0;
      const denominator = Math.pow(1 + r, n) - 1;
      if (Math.abs(denominator) < 1e-10) return (fv - pvGrowth) / n;
      const pmt = (fv - pvGrowth) * r / denominator;
      return isNaN(pmt) ? 0 : pmt;
    };

    const monthlySavingsRequired = calculatePMT(aReturn);
    const scenarios = {
      pessimistic: calculatePMT(aReturn - 2),
      base: monthlySavingsRequired,
      optimistic: calculatePMT(aReturn + 2)
    };

    // Projection with Milestones and Tax Reinvestment
    let currentCap = cSavings;
    const currentYear = new Date().getFullYear();

    for (let i = 0; i <= yearsToRetire; i++) {
      const year = currentYear + i;
      
      if (i > 0) {
        const annualSavings = (monthlySavingsRequired * 12) + (taxSettings.reinvestSavings ? taxSavings : 0);
        currentCap = (currentCap * (1 + aReturn / 100)) + annualSavings;
      }

      // Subtract milestones
      const yearMilestones = milestones.filter(m => m.year === year);
      yearMilestones.forEach(m => {
        currentCap -= m.amount;
      });

      if (currentCap < 0) currentCap = 0;

      accumulationProjections.push({
        year: i,
        age: cAge + i,
        capital: isNaN(currentCap) ? 0 : currentCap
      });
    }

    const yearlyProjections = [];
    let currentWithdrawalCap = accumulationProjections[accumulationProjections.length - 1]?.capital || targetCapital;
    
    // Split withdrawal: 80% general, 20% medical
    let generalWithdrawal = firstYearWithdrawal * 0.8;
    let medicalWithdrawal = firstYearWithdrawal * 0.2;

    for (let i = 0; i <= 30; i++) {
      const year = currentYear + yearsToRetire + i;
      const totalWithdrawal = generalWithdrawal + medicalWithdrawal;

      yearlyProjections.push({
        year: i,
        age: rAge + i,
        withdrawal: isNaN(totalWithdrawal) ? 0 : totalWithdrawal,
        remainingCapital: isNaN(currentWithdrawalCap) ? 0 : currentWithdrawalCap
      });

      // Subtract milestones in withdrawal phase
      const yearMilestones = milestones.filter(m => m.year === year);
      yearMilestones.forEach(m => {
        currentWithdrawalCap -= m.amount;
      });

      currentWithdrawalCap = (currentWithdrawalCap * (1 + eReturn / 100)) - totalWithdrawal;
      
      // Apply different inflation rates
      generalWithdrawal *= (1 + iRate / 100);
      medicalWithdrawal *= (1 + mInflation / 100);
      
      if (currentWithdrawalCap < 0) currentWithdrawalCap = 0;
    }

    // Calculate years saved by tax reinvestment
    let yearsSaved = 0;
    if (taxSettings.reinvestSavings && taxSavings > 0 && targetCapital > 0) {
        let shadowCap = cSavings;
        let shadowYearToTarget = 50;
        for (let i = 1; i <= 50; i++) {
            shadowCap = (shadowCap * (1 + aReturn / 100)) + (monthlySavingsRequired * 12);
            if (shadowCap >= targetCapital) {
                shadowYearToTarget = i;
                break;
            }
        }
        
        let reinvestCap = cSavings;
        let reinvestYearToTarget = 50;
        for (let i = 1; i <= 50; i++) {
            reinvestCap = (reinvestCap * (1 + aReturn / 100)) + (monthlySavingsRequired * 12) + taxSavings;
            if (reinvestCap >= targetCapital) {
                reinvestYearToTarget = i;
                break;
            }
        }
        yearsSaved = Math.max(0, shadowYearToTarget - reinvestYearToTarget);
    }

    // --- Fixed Savings Driven Calculation ---
    const fixedProjections = [];

    for (let i = 0; i <= yearsToRetire; i++) {
      const n = i * 12;
      
      const existingGrowth = (investments.length > 0)
        ? investments.reduce((sum, inv) => {
            const invReturn = inv.expectedReturn ?? aReturn;
            const r_inv = (invReturn || 0) / 100 / 12;
            return sum + ((inv.amount || 0) * Math.pow(1 + r_inv, n));
          }, 0)
        : (cSavings * Math.pow(1 + r_base, n));
        
      const savingsGrowth = fSavings > 0 && i > 0
        ? (r_base === 0 ? fSavings * n : fSavings * (Math.pow(1 + r_base, n) - 1) / r_base * (1 + r_base))
        : 0;

      fixedProjections.push({
        age: cAge + i,
        capital: isNaN(existingGrowth + savingsGrowth) ? 0 : existingGrowth + savingsGrowth
      });
    }

    const finalFixedCapital = fixedProjections[fixedProjections.length - 1]?.capital || cSavings;
    const potentialMonthlyIncome = (finalFixedCapital * (wRate / 100)) / 12;

    // --- Health Score Calculation ---
    const progressScore = targetCapital > 0 ? Math.min(40, (cSavings / targetCapital) * 40) : 0;
    const savingsScore = (monthlySavingsRequired <= 0 || isNaN(monthlySavingsRequired)) ? 30 : Math.min(30, (fSavings / monthlySavingsRequired) * 30);
    
    const growthInvestments = investments.filter(i => i.category === 'Global Equity').reduce((sum, i) => sum + i.amount, 0);
    const currentGrowthRatio = cSavings > 0 ? (growthInvestments / cSavings) : 0.8; // Assume 0.8 if no investments yet
    const allocationScore = Math.max(0, 20 - Math.abs(currentGrowthRatio - 0.8) * 50); // Penalty for deviation from 80%
    
    const timeScore = Math.min(10, (yearsToRetire / 20) * 10);
    
    const totalScore = Math.round((isNaN(progressScore) ? 0 : progressScore) + (isNaN(savingsScore) ? 0 : savingsScore) + (isNaN(allocationScore) ? 0 : allocationScore) + (isNaN(timeScore) ? 0 : timeScore));
    
    let healthLabel = t.healthAtRisk;
    let healthColor = "#f43f5e"; // rose-500
    if (totalScore >= 85) {
      healthLabel = t.healthExcellent;
      healthColor = "#10b981"; // emerald-500
    } else if (totalScore >= 70) {
      healthLabel = t.healthGood;
      healthColor = "#3b82f6"; // blue-500
    } else if (totalScore >= 50) {
      healthLabel = t.healthFair;
      healthColor = "#f59e0b"; // amber-500
    }

    return {
      targetCapital: isNaN(targetCapital) ? 0 : targetCapital,
      firstYearWithdrawal: isNaN(firstYearWithdrawal) ? 0 : firstYearWithdrawal,
      growthEngine: isNaN(growthEngine) ? 0 : growthEngine,
      cashBuffer: isNaN(cashBuffer) ? 0 : cashBuffer,
      cashBufferYears: isNaN(cashBufferYears) ? 0 : cashBufferYears,
      cashBufferAmount: isNaN(cashBufferAmount) ? 0 : cashBufferAmount,
      futureMonthlyIncome: isNaN(futureMonthlyIncome) ? 0 : futureMonthlyIncome,
      futurePurchasingPower: isNaN(futurePurchasingPower) ? 0 : futurePurchasingPower,
      requiredMonthlySavings: isNaN(monthlySavingsRequired) ? 0 : monthlySavingsRequired,
      scenarios: {
        pessimistic: isNaN(scenarios.pessimistic) ? 0 : scenarios.pessimistic,
        base: isNaN(scenarios.base) ? 0 : scenarios.base,
        optimistic: isNaN(scenarios.optimistic) ? 0 : scenarios.optimistic
      },
      yearsToRetire: isNaN(yearsToRetire) ? 0 : yearsToRetire,
      accumulationProjections,
      yearlyProjections,
      fixedSavingsResult: {
        finalCapital: isNaN(finalFixedCapital) ? 0 : finalFixedCapital,
        potentialMonthlyIncome: isNaN(potentialMonthlyIncome) ? 0 : potentialMonthlyIncome,
        projections: fixedProjections
      },
      healthScore: {
        total: isNaN(totalScore) ? 0 : totalScore,
        progress: Math.round(progressScore) || 0,
        savings: Math.round(savingsScore) || 0,
        allocation: Math.round(allocationScore) || 0,
        time: Math.round(timeScore) || 0,
        label: healthLabel,
        color: healthColor
      },
      taxSavings: isNaN(taxSavings) ? 0 : taxSavings,
      yearsSavedByTaxReinvestment: isNaN(yearsSaved) ? 0 : yearsSaved
    };
  }, [monthlyIncome, currentAge, retirementAge, inflationRate, expectedReturn, currentSavings, accumulationReturn, withdrawalRate, fixedMonthlySavings, investments, t, medicalInflationRate, taxSettings, milestones]);

  // --- Monte Carlo Simulation Logic ---
  const monteCarloResults = useMemo(() => {
    const numSimulations = 1000;
    const years = results.yearsToRetire;
    if (years <= 0) return { successRate: 100, worstCase: currentSavings, medianCase: currentSavings };

    // Define volatility for each category
    const volMap: Record<string, number> = {
      'Global Equity': 0.18,
      'Thai Equity': 0.22,
      'Fixed Income': 0.06,
      'REITs': 0.15,
      'Cash': 0.01,
      'Other': 0.15
    };

    // Calculate weighted expected return and volatility
    let totalWeight = 0;
    let weightedReturn = 0;
    let weightedVol = 0;

    if (investments.length > 0 && currentSavings > 0) {
      investments.forEach(inv => {
        const weight = inv.amount / currentSavings;
        totalWeight += weight;
        weightedReturn += (inv.expectedReturn || accumulationReturn) * weight;
        weightedVol += (volMap[inv.category] || 0.15) * weight;
      });
    } else {
      weightedReturn = accumulationReturn;
      weightedVol = 0.15; // Default volatility
    }

    const annualReturn = (weightedReturn || 0) / 100;
    const annualVol = weightedVol || 0;
    const monthlySavings = results.requiredMonthlySavings || 0;
    const target = results.targetCapital || 0;

    const finalValues: number[] = [];
    let successCount = 0;

    for (let i = 0; i < numSimulations; i++) {
      let balance = Number(currentSavings) || 0;
      for (let y = 0; y < years; y++) {
        // Box-Muller transform for normal distribution
        const u1 = Math.max(0.0001, Math.random());
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        
        const yearlyReturn = annualReturn + annualVol * (isNaN(z) ? 0 : z);
        balance = balance * (1 + yearlyReturn) + (monthlySavings * 12);
        if (isNaN(balance) || !isFinite(balance)) balance = 0;
      }
      finalValues.push(balance);
      if (balance >= target) successCount++;
    }

    finalValues.sort((a, b) => a - b);
    
    const worstCase = finalValues[Math.floor(numSimulations * 0.05)];
    const medianCase = finalValues[Math.floor(numSimulations * 0.5)];

    return {
      successRate: (successCount / numSimulations) * 100,
      worstCase: isNaN(worstCase) ? 0 : worstCase,
      medianCase: isNaN(medianCase) ? 0 : medianCase,
      allValues: finalValues
    };
  }, [currentSavings, investments, results.yearsToRetire, results.requiredMonthlySavings, results.targetCapital, accumulationReturn]);

  // --- AI Advisor Functions ---
  const generateAIInsights = async () => {
    if (isAiLoading) return;
    setIsAiLoading(true);
    try {
      const prompt = `
        As a professional financial advisor, analyze this retirement plan:
        - Current Age: ${currentAge}
        - Retirement Age: ${retirementAge}
        - Current Savings: ${currentSavings.toLocaleString()} THB
        - Target Capital: ${results.targetCapital.toLocaleString()} THB
        - Required Monthly Savings: ${results.requiredMonthlySavings.toLocaleString()} THB
        - Portfolio Health Score: ${results.healthScore.total}/100
        - Monte Carlo Success Rate: ${monteCarloResults.successRate.toFixed(1)}%
        - Tax Savings: ${results.taxSavings.toLocaleString()} THB
        - Reinvesting Tax Savings: ${taxSettings.reinvestSavings ? 'Yes' : 'No'}
        - Medical Inflation: ${medicalInflationRate}%
        - Milestones: ${milestones.map(m => `${m.name} (${m.year}: ${m.amount})`).join(', ')}
        - Asset Allocation: ${investments.map(i => `${i.name} (${i.category}: ${i.amount})`).join(', ')}
        
        Provide 3 concise, actionable insights in ${lang === 'th' ? 'Thai' : 'English'}. 
        Focus on how to improve the success rate, optimize tax benefits, or manage milestone risks.
        Keep it professional and encouraging.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiInsights(response.text || '');
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || isAiLoading) return;
    
    const userMessage = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsAiLoading(true);

    try {
      const history = chatHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      }));

      const systemPrompt = `You are a helpful financial advisor for a retirement planning app. 
      The user's data: Current Age ${currentAge}, Retirement Age ${retirementAge}, Target ${results.targetCapital.toLocaleString()} THB.
      Current Savings ${currentSavings.toLocaleString()} THB.
      Tax Savings: ${results.taxSavings.toLocaleString()} THB.
      Medical Inflation: ${medicalInflationRate}%.
      Milestones: ${milestones.map(m => `${m.name} (${m.year})`).join(', ')}.
      Answer in ${lang === 'th' ? 'Thai' : 'English'}. Keep it concise.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          ...history,
          { role: 'user', parts: [{ text: userMessage }] }
        ],
      });

      setChatHistory(prev => [...prev, { role: 'model', text: response.text || '' }]);
    } catch (error) {
      console.error("Chat Error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const pieData = [
    { name: t.growthEngine, value: results.growthEngine, color: '#ea580c' }, // orange-600
    { name: t.safetyNet, value: results.cashBuffer, color: '#fb923c' },   // orange-400
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-orange-50/30 text-zinc-900 font-sans selection:bg-orange-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-orange-100 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-orange-900">{t.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            {isAuthReady && (
              user ? (
                <div className="flex items-center gap-3">
                  <div className="hidden md:block text-right">
                    <p className="text-[10px] font-bold text-orange-900 leading-none">{user.displayName}</p>
                    <p className="text-[8px] text-orange-400 font-medium">{user.email}</p>
                  </div>
                  <img src={user.photoURL || ''} alt="avatar" className="w-8 h-8 rounded-full border border-orange-100" referrerPolicy="no-referrer" />
                  <button 
                    onClick={logout}
                    className="p-2 text-orange-400 hover:text-rose-600 transition-colors"
                    title={t.logout}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={async () => {
                    if (isLoggingIn) return;
                    setIsLoggingIn(true);
                    try {
                      await loginWithGoogle();
                    } finally {
                      setIsLoggingIn(false);
                    }
                  }}
                  disabled={isLoggingIn}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-orange-700 transition-all shadow-sm",
                    isLoggingIn && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <LogIn className={cn("w-3.5 h-3.5", isLoggingIn && "animate-spin")} />
                  {isLoggingIn ? (lang === 'th' ? 'กำลังเข้าสู่ระบบ...' : 'Logging in...') : t.login}
                </button>
              )
            )}
            <div className="flex bg-orange-50 p-1 rounded-lg border border-orange-100">
              <button 
                onClick={() => {
                  setLang('en');
                  saveProfile({ lang: 'en' });
                }}
                className={cn(
                  "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                  lang === 'en' ? "bg-white text-orange-600 shadow-sm" : "text-orange-300 hover:text-orange-500"
                )}
              >
                EN
              </button>
              <button 
                onClick={() => {
                  setLang('th');
                  saveProfile({ lang: 'th' });
                }}
                className={cn(
                  "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                  lang === 'th' ? "bg-white text-orange-600 shadow-sm" : "text-orange-300 hover:text-orange-500"
                )}
              >
                TH
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-4 space-y-6">
            <Card title={t.inputAnalysis} icon={Calculator}>
              <div className="space-y-5">
                <InputField 
                  label={t.monthlyIncome} 
                  value={monthlyIncome} 
                  onChange={(val) => {
                    setMonthlyIncome(val);
                    saveProfile({ monthlyIncome: val });
                  }} 
                  suffix={t.thb}
                  step={2000}
                />
                <div className="grid grid-cols-2 gap-4">
                  <InputField 
                    label={t.currentAge} 
                    value={currentAge} 
                    onChange={(val) => {
                      setCurrentAge(val);
                      saveProfile({ currentAge: val });
                    }} 
                  />
                  <InputField 
                    label={t.retirementAge} 
                    value={retirementAge} 
                    onChange={(val) => {
                      setRetirementAge(val);
                      saveProfile({ retirementAge: val });
                    }} 
                  />
                </div>
                <InputField 
                  label={t.inflationRate} 
                  value={inflationRate} 
                  onChange={(val) => {
                    setInflationRate(val);
                    saveProfile({ inflationRate: val });
                  }} 
                  suffix="%"
                />
                <InputField 
                  label={t.expectedReturn} 
                  value={expectedReturn} 
                  onChange={(val) => {
                    setExpectedReturn(val);
                    saveProfile({ expectedReturn: val });
                  }} 
                  suffix="%"
                />
                <InputField 
                  label={t.withdrawalRate} 
                  value={withdrawalRate} 
                  onChange={(val) => {
                    setWithdrawalRate(val);
                    saveProfile({ withdrawalRate: val });
                  }} 
                  suffix="%"
                />
                
                <div className="pt-4 border-t border-orange-50">
                  <div className="flex items-start gap-3 p-3 bg-orange-50/50 rounded-xl border border-orange-100">
                    <Info className="w-4 h-4 text-orange-300 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] leading-relaxed text-orange-600/70">
                        {t.infoBox}
                        <a 
                          href="https://jittawealth.com/blog/retirement-withdraw-5-percent-proof/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-1 text-orange-500 font-bold hover:underline inline-flex items-center gap-0.5"
                        >
                          {lang === 'th' ? 'อ่านเพิ่มเติม' : 'Read more'}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </p>
                      <p className="text-[10px] mt-1 text-orange-400 font-medium">
                        {t.calculatedTarget}: {Math.round(monthlyIncome * 240).toLocaleString()} {t.thb}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title={t.savingsStrategy} icon={TrendingUp}>
              <div className="space-y-5">
                <InputField 
                  label={t.currentSavings} 
                  value={currentSavings} 
                  onChange={(val) => {
                    setCurrentSavings(val);
                    saveProfile({ currentSavings: val });
                  }} 
                  suffix={t.thb}
                  step={1000}
                  disabled={user && investments.length > 0}
                />
                <InputField 
                  label={t.accumulationReturn} 
                  value={accumulationReturn} 
                  onChange={(val) => {
                    setAccumulationReturn(val);
                    saveProfile({ accumulationReturn: val });
                  }} 
                  suffix="%"
                />

                <div className="pt-4 border-t border-orange-50">
                  <InputField 
                    label={t.fixedMonthlySavings} 
                    value={fixedMonthlySavings} 
                    onChange={(val) => {
                      setFixedMonthlySavings(val);
                      saveProfile({ fixedMonthlySavings: val });
                    }} 
                    suffix={t.thb}
                    step={1000}
                  />
                  <p className="text-[10px] text-orange-400 mt-2 italic">
                    {t.fixedSavingsMode}
                  </p>
                </div>
                
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <PieChartIcon className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-orange-900 uppercase tracking-wider">{t.scenarioAnalysis}</span>
                  </div>
                  <p className="text-[10px] text-orange-400 mb-4 leading-relaxed italic">
                    {t.returnRangeInfo}
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg text-center">
                      <span className="text-[9px] font-bold text-rose-400 uppercase block mb-1">{t.pessimistic}</span>
                      <span className="text-xs font-bold font-mono text-rose-600">{Math.round(results.scenarios.pessimistic).toLocaleString()}</span>
                      <span className="text-[8px] text-rose-300 block mt-0.5">{lang === 'th' ? 'ออมเพิ่ม' : 'Save More'}</span>
                    </div>
                    <div className="p-2 bg-orange-600 rounded-lg text-center shadow-md shadow-orange-200">
                      <span className="text-[9px] font-bold text-orange-100 uppercase block mb-1">{t.baseCase}</span>
                      <span className="text-xs font-bold font-mono text-white">{Math.round(results.scenarios.base).toLocaleString()}</span>
                      <span className="text-[8px] text-orange-200 block mt-0.5">{lang === 'th' ? 'ออมเพิ่ม' : 'Save More'}</span>
                    </div>
                    <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-center">
                      <span className="text-[9px] font-bold text-emerald-400 uppercase block mb-1">{t.optimistic}</span>
                      <span className="text-xs font-bold font-mono text-emerald-600">{Math.round(results.scenarios.optimistic).toLocaleString()}</span>
                      <span className="text-[8px] text-emerald-300 block mt-0.5">{lang === 'th' ? 'ออมเพิ่ม' : 'Save More'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title={t.actionPlan} icon={ListChecks} className="bg-white/80 backdrop-blur-md border-l-4 border-l-orange-600 shadow-xl shadow-orange-100/20">
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                  <div>
                    <p className="text-[10px] font-bold text-orange-600 uppercase tracking-[0.2em] mb-1">{t.monthlySavingsGoal}</p>
                    <p className="text-3xl font-bold font-mono text-orange-900">
                      {Math.round(results.requiredMonthlySavings || 0).toLocaleString()}
                      <span className="text-sm font-medium text-orange-400 ml-2">{t.thbMo}</span>
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-200">
                    <ArrowUpRight className="w-6 h-6 text-white" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-4 bg-orange-600 rounded-full" />
                    <h3 className="text-xs font-bold text-orange-900 uppercase tracking-widest">{t.nextSteps}</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { 
                        icon: TrendingUp, 
                        title: lang === 'th' ? 'เพิ่มการออม' : 'Increase Savings', 
                        desc: lang === 'th' ? `ออมเพิ่มอีก ${Math.max(0, Math.round((results.requiredMonthlySavings || 0) - (Number(fixedMonthlySavings) || 0))).toLocaleString()} บาท/เดือน` : `Save ${Math.max(0, Math.round((results.requiredMonthlySavings || 0) - (Number(fixedMonthlySavings) || 0))).toLocaleString()} more per month`,
                        color: 'text-orange-600',
                        bg: 'bg-orange-50'
                      },
                      { 
                        icon: PieChartIcon, 
                        title: lang === 'th' ? 'ปรับพอร์ต' : 'Rebalance Portfolio', 
                        desc: lang === 'th' ? 'เน้นสินทรัพย์ที่ให้ผลตอบแทนสูงขึ้น' : 'Focus on higher return assets',
                        color: 'text-blue-600',
                        bg: 'bg-blue-50'
                      },
                      { 
                        icon: ShieldCheck, 
                        title: lang === 'th' ? 'ลดค่าใช้จ่าย' : 'Reduce Expenses', 
                        desc: lang === 'th' ? 'ปรับลดงบประมาณหลังเกษียณ' : 'Adjust post-retirement budget',
                        color: 'text-emerald-600',
                        bg: 'bg-emerald-50'
                      }
                    ].map((step, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-4 p-4 bg-zinc-50/50 rounded-2xl border border-zinc-100 hover:bg-white hover:shadow-md transition-all group"
                      >
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", step.bg)}>
                          <step.icon className={cn("w-5 h-5", step.color)} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-900 tracking-tight">{step.title}</p>
                          <p className="text-[10px] text-zinc-400 font-medium">{step.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Analysis */}
          <div className="lg:col-span-8 space-y-8">
            {/* Portfolio Section */}
            {user && (
              <Card title={t.portfolio} icon={Wallet} className="border-l-4 border-l-emerald-500 shadow-xl shadow-emerald-100/10">
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 gap-6">
                    <div className="w-full sm:w-auto">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">{t.totalPortfolio}</p>
                      <p className="text-3xl font-bold font-mono text-emerald-900">
                        {Math.round(currentSavings).toLocaleString()} 
                        <span className="text-sm font-medium text-emerald-400 ml-2">{t.thb}</span>
                      </p>
                    </div>
                    <div className="flex flex-col xs:flex-row gap-3 w-full sm:w-auto">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnalyzing}
                        className={cn(
                          "flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-emerald-200 text-emerald-600 text-xs font-bold rounded-xl hover:bg-emerald-50 transition-all shadow-sm active:scale-95",
                          isAnalyzing && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Zap className={cn("w-4 h-4", isAnalyzing && "animate-spin")} />
                        {isAnalyzing ? (lang === 'th' ? 'กำลังวิเคราะห์...' : 'Analyzing...') : t.quickImport}
                      </button>
                      <button 
                        onClick={addInvestment}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        {t.addInvestment}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AnimatePresence mode="popLayout">
                      {investments.map((inv) => (
                        <InvestmentCard 
                          key={inv.id}
                          inv={inv}
                          t={t}
                          updateInvestment={updateInvestment}
                          recordInvestmentHistory={recordInvestmentHistory}
                          deleteInvestment={deleteInvestment}
                          setSelectedInvestment={setSelectedInvestment}
                          accumulationReturn={accumulationReturn}
                        />
                      ))}
                    </AnimatePresence>
                    {investments.length === 0 && (
                      <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-zinc-100 rounded-[2.5rem] bg-zinc-50/30">
                        <Wallet className="w-10 h-10 text-zinc-200 mb-4" />
                        <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">{t.addInvestment}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Summary Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {isSyncing && (
                <div className="col-span-full flex items-center gap-2 text-[10px] font-bold text-orange-400 animate-pulse bg-orange-50/50 px-3 py-1 rounded-full w-fit">
                  <Zap className="w-3 h-3" />
                  {t.syncing}
                </div>
              )}
              
              {/* Goal Progress Card */}
              <Card className="col-span-full bg-gradient-to-br from-orange-600 to-orange-700 text-white border-none shadow-2xl shadow-orange-200/50 overflow-hidden relative min-h-[auto] md:min-h-[220px] flex items-center p-8 sm:p-10">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <Target className="w-48 h-48 sm:w-64 sm:h-64" />
                </div>
                <div className="relative z-10 w-full">
                  <div className="flex flex-col lg:flex-row justify-between items-center gap-10">
                    <div className="flex-1 w-full space-y-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                          <Target className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-orange-100">{t.goalProgressTitle}</h2>
                          <p className="text-[10px] font-medium text-orange-200/80 uppercase tracking-widest">{t.sustainabilityFirst}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-5">
                        <div className="flex justify-between items-end">
                          <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-bold font-mono tracking-tighter">
                              {results.targetCapital > 0 ? Math.min(100, Math.round((currentSavings / results.targetCapital) * 100)) : 0}%
                            </span>
                            <span className="text-orange-200 text-sm font-bold uppercase tracking-widest">Progress</span>
                          </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-orange-100 uppercase tracking-wider mb-1">Current / Target</p>
                      <p className="text-sm font-bold font-mono">
                        {Math.round(currentSavings).toLocaleString()} <span className="text-orange-300">/</span> {Math.round(results.targetCapital).toLocaleString()} <span className="text-[10px] text-orange-300">{t.thb}</span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Progress Stats for Mobile */}
                  <div className="sm:hidden mt-2 text-left">
                    <p className="text-[10px] font-bold text-orange-100 uppercase tracking-wider mb-1">Current / Target</p>
                    <p className="text-xs font-bold font-mono">
                      {Math.round(currentSavings).toLocaleString()} <span className="text-orange-300">/</span> {Math.round(results.targetCapital).toLocaleString()} <span className="text-[8px] text-orange-300">{t.thb}</span>
                    </p>
                  </div>
                        
                        <div className="relative">
                          <div className="h-4 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${results.targetCapital > 0 ? Math.min(100, (currentSavings / results.targetCapital) * 100) : 0}%` }}
                              transition={{ duration: 1.5, ease: "circOut" }}
                              className="h-full bg-gradient-to-r from-white via-orange-100 to-white shadow-[0_0_20px_rgba(255,255,255,0.6)] relative"
                            >
                              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[shimmer_2s_linear_infinite]" />
                            </motion.div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-orange-200/60">
                          <span>{t.start}</span>
                          <span>{t.targetCapital}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="w-full lg:w-px h-px lg:h-40 bg-white/20" />
                    
                    <div className="flex-1 w-full space-y-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                          <Calendar className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-orange-100">{t.estimatedRetirement}</h2>
                          <p className="text-[10px] font-medium text-orange-200/80 uppercase tracking-widest">{lang === 'th' ? 'วันที่คาดการณ์' : 'Forecasted Date'}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-4xl font-bold font-mono tracking-tighter">
                          {(() => {
                            const date = new Date();
                            date.setFullYear(date.getFullYear() + results.yearsToRetire);
                            return date.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            });
                          })()}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-0.5 bg-white/20 rounded-md text-[10px] font-bold uppercase tracking-wider">
                            {results.yearsToRetire} {t.years}
                          </div>
                          <span className="text-xs font-medium text-orange-100/80 italic">
                            {lang === 'th' ? 'นับจากวันนี้' : 'from now'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-6 p-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-orange-200 uppercase tracking-widest">{t.remainingAmount}</span>
                          <span className="text-sm font-bold font-mono">
                            {Math.max(0, Math.round(results.targetCapital - currentSavings)).toLocaleString()} <span className="text-[10px] text-orange-300">{t.thb}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Health Score Card */}
              <Card title={t.healthScore} icon={ShieldCheck} className="lg:col-span-2 lg:row-span-2 border-l-4 border-l-emerald-500 overflow-hidden bg-white/80 backdrop-blur-md shadow-xl shadow-emerald-100/20">
                <div className="flex flex-col h-full p-2">
                  <div className="flex items-center justify-between mb-10">
                    <div>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.2em] mb-2">{t.healthScoreDesc}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl sm:text-6xl font-bold font-mono tracking-tighter" style={{ color: results.healthScore.color }}>
                          {results.healthScore.total}
                        </span>
                        <span className="text-sm sm:text-lg font-bold text-emerald-200 font-mono">/ 100</span>
                      </div>
                    </div>
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="px-6 py-3 rounded-2xl text-white text-sm font-bold shadow-xl shadow-emerald-200/50 flex flex-col items-center"
                      style={{ backgroundColor: results.healthScore.color }}
                    >
                      <span className="text-[10px] opacity-80 uppercase tracking-widest mb-0.5">Status</span>
                      {results.healthScore.label}
                    </motion.div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 mt-auto">
                    {[
                      { label: t.progressScore, value: results.healthScore.progress, max: 40, color: 'bg-orange-500' },
                      { label: t.savingsScore, value: results.healthScore.savings, max: 30, color: 'bg-blue-500' },
                      { label: t.allocationScore, value: results.healthScore.allocation, max: 20, color: 'bg-emerald-500' },
                      { label: t.timeScore, value: results.healthScore.time, max: 10, color: 'bg-purple-500' }
                    ].map((item, i) => (
                      <div key={i} className="space-y-2.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.1em]">
                          <span className="text-zinc-400">{item.label}</span>
                          <span className="text-zinc-900 font-mono flex gap-1">
                            {item.value} <span className="text-zinc-300">/ {item.max}</span>
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden p-0.5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.value / item.max) * 100}%` }}
                            transition={{ duration: 1.2, delay: i * 0.1, ease: "circOut" }}
                            className={cn("h-full rounded-full shadow-sm", item.color)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="flex flex-col justify-center border-l-4 border-l-orange-600 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white/50 min-h-[140px] p-6 sm:p-8">
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-3">{t.targetCapital}</span>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tighter text-orange-900">
                    {Math.round(results.targetCapital).toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-orange-300 uppercase whitespace-nowrap">{t.thb}</span>
                </div>
              </Card>
              
              <Card className="flex flex-col justify-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-orange-400/50 bg-white/50 min-h-[140px] p-6 sm:p-8">
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-3">{t.firstYearWithdrawal}</span>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tighter text-orange-900">
                    {Math.round(results.firstYearWithdrawal).toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-orange-300 uppercase whitespace-nowrap">{t.thbYr}</span>
                </div>
              </Card>
              
              <Card className="flex flex-col justify-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-l-4 border-l-orange-400/50 bg-white/50 min-h-[140px] p-6 sm:p-8">
                <div className="flex flex-col mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                    {t.futureMonthlyIncome
                      .replace('{monthlyIncome}', monthlyIncome.toLocaleString())
                      .replace('{thb}', t.thb)
                    }
                  </span>
                  <span className="text-[8px] text-orange-300 mt-1 leading-tight font-bold uppercase tracking-widest">
                    {t.futureMonthlyIncomeDesc
                      .replace('{retirementAge}', retirementAge.toString())
                    }
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tighter text-orange-900">
                    {Math.round(results.futurePurchasingPower).toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-orange-300 uppercase">{t.thb}</span>
                </div>
              </Card>
              
              <Card className="flex flex-col justify-center border-l-4 border-l-blue-500 bg-blue-50/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 min-h-[140px] p-6 sm:p-8">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-3">{t.marketCondition}</span>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0 shadow-sm">
                    <TrendingUp className="w-7 h-7 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xl sm:text-2xl font-bold text-blue-900 block leading-tight truncate">{t.bullMarket}</span>
                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mt-1 block truncate">{t.marketPulse}</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Advanced Analysis: Monte Carlo & AI Advisor */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Monte Carlo Simulation Card */}
              <Card title={t.monteCarloTitle} icon={Dices} className="bg-white/80 backdrop-blur-md border-l-4 border-l-purple-600 shadow-xl shadow-purple-100/20">
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-purple-50/50 p-6 rounded-2xl border border-purple-100">
                    <div>
                      <p className="text-[10px] font-bold text-purple-600 uppercase tracking-[0.2em] mb-2">{t.successProbability}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-bold font-mono tracking-tighter text-purple-900">
                          {monteCarloResults.successRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-200">
                      <TrendingUp className="w-8 h-8 text-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-zinc-50/50 rounded-2xl border border-zinc-100">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t.worstCase}</p>
                      <p className="text-xl font-bold font-mono text-zinc-900">
                        {Math.round(monteCarloResults.worstCase).toLocaleString()}
                        <span className="text-xs font-medium text-zinc-400 ml-2">{t.thb}</span>
                      </p>
                    </div>
                    <div className="p-4 bg-zinc-50/50 rounded-2xl border border-zinc-100">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t.medianCase}</p>
                      <p className="text-xl font-bold font-mono text-zinc-900">
                        {Math.round(monteCarloResults.medianCase).toLocaleString()}
                        <span className="text-xs font-medium text-zinc-400 ml-2">{t.thb}</span>
                      </p>
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-400 italic leading-relaxed">
                    {t.simulationInfo}
                  </p>
                </div>
              </Card>

              {/* AI Advisor Card */}
              <Card title={t.aiAdvisorTitle} icon={Sparkles} className="bg-white/80 backdrop-blur-md border-l-4 border-l-blue-600 shadow-xl shadow-blue-100/20 flex flex-col">
                <div className="flex-1 flex flex-col space-y-4">
                  <div className="flex-1 overflow-y-auto max-h-[300px] space-y-4 pr-2 scrollbar-thin scrollbar-thumb-blue-100">
                    {chatHistory.length === 0 && !aiInsights && (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                          <MessageSquare className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900">{t.aiAdvisorDesc}</p>
                          <p className="text-xs text-zinc-400 mt-1">{t.aiDisclaimer}</p>
                        </div>
                        <button 
                          onClick={generateAIInsights}
                          disabled={isAiLoading}
                          className="px-6 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95 disabled:opacity-50"
                        >
                          {isAiLoading ? t.aiThinking : t.aiInsightsTitle}
                        </button>
                      </div>
                    )}

                    {aiInsights && (
                      <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-3 h-3 text-blue-600" />
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{t.aiInsightsTitle}</span>
                        </div>
                        <div className="text-xs text-zinc-700 leading-relaxed whitespace-pre-wrap">
                          {aiInsights}
                        </div>
                      </div>
                    )}

                    {chatHistory.map((msg, i) => (
                      <div key={i} className={cn(
                        "flex flex-col max-w-[85%]",
                        msg.role === 'user' ? "ml-auto items-end" : "items-start"
                      )}>
                        <div className={cn(
                          "p-3 rounded-2xl text-xs leading-relaxed",
                          msg.role === 'user' 
                            ? "bg-blue-600 text-white rounded-tr-none" 
                            : "bg-zinc-100 text-zinc-700 rounded-tl-none"
                        )}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isAiLoading && chatHistory.length > 0 && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-blue-400 animate-pulse">
                        <Sparkles className="w-3 h-3" />
                        {t.aiThinking}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-zinc-100">
                    <div className="relative">
                      <input 
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                        placeholder={t.aiChatPlaceholder}
                        className="w-full pl-4 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                      <button 
                        onClick={handleChat}
                        disabled={!chatInput.trim() || isAiLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Strategic Planning: Tax & Milestones */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Tax Optimizer Card */}
              <Card title={t.taxOptimizerTitle} icon={ShieldCheck} className="bg-white/80 backdrop-blur-md border-l-4 border-l-emerald-600 shadow-xl shadow-emerald-100/20">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField 
                      label={t.taxableIncome} 
                      value={taxSettings.taxableIncome} 
                      onChange={(val) => saveProfile({ taxSettings: { ...taxSettings, taxableIncome: val } })} 
                      suffix={t.thb}
                    />
                    <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.2em] mb-1">{t.taxSavings}</p>
                      <p className="text-2xl font-bold font-mono text-emerald-900">
                        {Math.round(results.taxSavings).toLocaleString()}
                        <span className="text-xs font-medium text-emerald-400 ml-2">{t.thb}</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField 
                      label={t.ssfAmount} 
                      value={taxSettings.ssfAmount} 
                      onChange={(val) => saveProfile({ taxSettings: { ...taxSettings, ssfAmount: val } })} 
                      suffix={t.thb}
                    />
                    <InputField 
                      label={t.rmfAmount} 
                      value={taxSettings.rmfAmount} 
                      onChange={(val) => saveProfile({ taxSettings: { ...taxSettings, rmfAmount: val } })} 
                      suffix={t.thb}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        taxSettings.reinvestSavings ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-zinc-200 text-zinc-400"
                      )}>
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-900">{t.reinvestSavings}</p>
                        <p className="text-[10px] text-zinc-400">{t.reinvestSavingsDesc.replace('{years}', results.yearsSavedByTaxReinvestment.toString())}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => saveProfile({ taxSettings: { ...taxSettings, reinvestSavings: !taxSettings.reinvestSavings } })}
                      className={cn(
                        "w-12 h-6 rounded-full relative transition-all duration-300",
                        taxSettings.reinvestSavings ? "bg-emerald-600" : "bg-zinc-300"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300",
                        taxSettings.reinvestSavings ? "right-1" : "left-1"
                      )} />
                    </button>
                  </div>
                </div>
              </Card>

              {/* Life Milestones & Stress Test Card */}
              <Card title={t.lifeMilestones} icon={Calendar} className="bg-white/80 backdrop-blur-md border-l-4 border-l-rose-600 shadow-xl shadow-rose-100/20">
                <div className="space-y-6">
                  <div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-rose-100">
                    {milestones.length === 0 ? (
                      <div className="text-center py-8 bg-rose-50/30 rounded-2xl border border-dashed border-rose-200">
                        <p className="text-xs text-rose-400 font-medium">{t.addMilestone}</p>
                      </div>
                    ) : (
                      milestones.map((m) => (
                        <div key={m.id} className="p-4 bg-white rounded-2xl border border-rose-100 shadow-sm flex items-center justify-between group hover:border-rose-300 transition-all">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              m.type === 'shock' ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {m.type === 'shock' ? <AlertTriangle className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-900">{m.name}</p>
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                {m.year} • {m.amount.toLocaleString()} {t.thb}
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => deleteMilestone(m.id)}
                            className="p-2 text-zinc-300 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t.addMilestone}</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => addMilestone('expense')}
                          className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => addMilestone('shock')}
                          className="p-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all shadow-md shadow-rose-100"
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Inflation Settings Card */}
            <Card title={t.inflationByCategory} icon={TrendingUp} className="bg-white/80 backdrop-blur-md border-l-4 border-l-amber-600 shadow-xl shadow-amber-100/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <InputField 
                    label={t.generalInflation} 
                    value={inflationRate} 
                    onChange={(val) => saveProfile({ inflationRate: val })} 
                    suffix="%" 
                    step={0.1}
                  />
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    {t.infoBox}
                  </p>
                </div>
                <div className="space-y-4">
                  <InputField 
                    label={t.medicalInflation} 
                    value={medicalInflationRate} 
                    onChange={(val) => saveProfile({ medicalInflationRate: val })} 
                    suffix="%" 
                    step={0.1}
                  />
                  <p className="text-[10px] text-amber-600 font-medium leading-relaxed">
                    {t.medicalInflationDesc}
                  </p>
                </div>
              </div>
            </Card>

            {/* AI Advanced Analytics & Portfolio Doctor */}
            <section className="space-y-12">
              <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 border-b border-rose-100 pb-8">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-8 bg-rose-600 rounded-full" />
                  <div>
                    <h2 className="text-3xl font-bold text-rose-950 tracking-tight">{t.detailedAnalysis}</h2>
                    <p className="text-xs font-semibold text-rose-900/40 uppercase tracking-[0.2em] mt-1">{lang === 'th' ? 'วิเคราะห์เชิงลึกด้วย AI' : 'AI Powered Insights'}</p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <AIPortfolioDoctor investments={investments} age={currentAge} t={t} lang={lang} />
                <AssetAllocationChart investments={investments} t={t} />
              </div>
            </section>

            {/* Market Insights Section */}
            <div className="space-y-12">
              <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 border-b border-orange-100 pb-8">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-8 bg-orange-600 rounded-full" />
                  <div>
                    <h2 className="text-3xl font-bold text-orange-950 tracking-tight">{t.marketInsights}</h2>
                    <p className="text-xs font-semibold text-orange-900/40 uppercase tracking-[0.2em] mt-1">{lang === 'th' ? 'ก้าวทันทุกความเคลื่อนไหว' : 'Stay ahead of the curve'}</p>
                  </div>
                </div>
                <button className="group flex items-center gap-2 px-6 py-3 bg-white border border-orange-100 rounded-2xl shadow-sm hover:border-orange-600 hover:shadow-xl hover:shadow-orange-900/5 transition-all active:scale-95">
                  <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">{lang === 'th' ? 'ดูบทความทั้งหมด' : 'All Articles'}</span>
                  <ChevronRight className="w-4 h-4 text-orange-600 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <MarketPulse t={t} lang={lang} />
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-6 ml-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-pulse" />
                    <span className="text-[10px] font-bold text-orange-950/40 uppercase tracking-widest">{lang === 'th' ? 'บทความล่าสุด' : 'Latest Reads'}</span>
                  </div>
                  {MARKET_INSIGHTS.map((insight, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="group p-6 bg-white border border-orange-100 rounded-[2rem] hover:border-orange-600 hover:shadow-2xl hover:shadow-orange-900/5 transition-all cursor-pointer relative overflow-hidden"
                      onClick={() => window.open(insight.url, '_blank')}
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <ArrowUpRight className="w-5 h-5 text-orange-600" />
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-orange-50 text-orange-600 text-[8px] font-bold uppercase tracking-[0.2em] rounded-lg">
                            {insight.tag}
                          </span>
                          <span className="text-[9px] text-zinc-300 font-bold uppercase tracking-widest">
                            {new Date(insight.date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        
                        <div>
                          <h3 className="text-md font-bold text-orange-950 mb-2 group-hover:text-orange-600 transition-colors line-clamp-2 tracking-tight leading-tight">
                            {insight.title[lang]}
                          </h3>
                          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 font-medium">
                            {insight.description[lang]}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>


            {/* Portfolio Blueprint */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card title={t.portfolioBlueprint} icon={PieChartIcon}>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => `${Math.round(value).toLocaleString()} ${t.thb}`}
                      />
                      <RechartsLegend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-orange-400 font-medium">{t.growthEngine} (80%)</span>
                    <span className="font-mono font-bold text-orange-900">{Math.round(results.growthEngine).toLocaleString()} {t.thb}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-orange-400 font-medium">{t.safetyNet} (20%)</span>
                    <span className="font-mono font-bold text-orange-900">{Math.round(results.cashBuffer).toLocaleString()} {t.thb}</span>
                  </div>
                </div>
              </Card>

              <Card title={t.marketRules} icon={ShieldCheck}>
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">{t.bullMarket}</span>
                    </div>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      {t.bullDesc}
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t.sideways}</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 leading-relaxed">
                      {t.sidewaysDesc}
                    </p>
                  </div>
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      <span className="text-[10px] font-bold text-rose-700 uppercase tracking-widest">{t.bearMarket}</span>
                    </div>
                    <p className="text-[11px] text-rose-800 leading-relaxed">
                      {t.bearDesc}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Projections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card title={t.savingsDrivenProjection} icon={TrendingUp} className="border-l-4 border-l-blue-500">
                <div className="flex flex-col h-full">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1">{t.finalCapital}</span>
                      <p className="text-xl font-bold font-mono text-blue-900">
                        {Math.round(results.fixedSavingsResult.finalCapital || 0).toLocaleString()}
                        <span className="text-[10px] ml-1 text-blue-400">{t.thb}</span>
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">{t.potentialMonthlyIncome}</span>
                      <p className="text-xl font-bold font-mono text-emerald-900">
                        {Math.round(results.fixedSavingsResult.potentialMonthlyIncome || 0).toLocaleString()}
                        <span className="text-[10px] ml-1 text-emerald-400">{t.thb}</span>
                      </p>
                    </div>
                  </div>

                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={results.fixedSavingsResult.projections}>
                        <defs>
                          <linearGradient id="colorFixed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                        <XAxis 
                          dataKey="age" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#3b82f6' }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#3b82f6' }}
                          tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                        />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number) => [`${Math.round(value).toLocaleString()} ${t.thb}`, t.capital]}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="capital" 
                          stroke="#3b82f6" 
                          fillOpacity={1} 
                          fill="url(#colorFixed)" 
                          strokeWidth={3}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-4 text-[10px] text-blue-400 font-medium text-center leading-relaxed">
                    {t.potentialIncomeDesc}
                  </p>
                </div>
              </Card>

              <Card title={t.accumulationProjection} icon={TrendingUp}>
                <div className="h-[240px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.accumulationProjections}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                      <XAxis 
                        dataKey="age" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#fb923c' }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#fb923c' }}
                        tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                      />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${Math.round(value).toLocaleString()} ${t.thb}`, t.capital]}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="capital" 
                        stroke="#fb923c" 
                        strokeWidth={3} 
                        dot={false} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[10px] text-orange-400 font-medium text-center">
                  {t.reachTarget.replace('{years}', results.yearsToRetire.toString())}
                </p>
              </Card>

              <Card title={t.projection} icon={TrendingUp}>
                <div className="h-[240px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.yearlyProjections}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                      <XAxis 
                        dataKey="age" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#fb923c' }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#fb923c' }}
                        tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                      />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${Math.round(value).toLocaleString()} ${t.thb}`, t.capital]}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="remainingCapital" 
                        stroke="#ea580c" 
                        strokeWidth={3} 
                        dot={false} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[10px] text-orange-600 font-medium text-center">
                  {t.retirementAge} - {retirementAge + 30}
                </p>
              </Card>
            </div>

            {/* Table */}
            <Card title={t.schedule} icon={TableIcon}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-orange-50">
                      <th className="py-3 font-semibold text-orange-300 uppercase tracking-wider">{t.year}</th>
                      <th className="py-3 font-semibold text-orange-300 uppercase tracking-wider">{t.age}</th>
                      <th className="py-3 font-semibold text-orange-300 uppercase tracking-wider text-right">{t.withdrawal}</th>
                      <th className="py-3 font-semibold text-orange-300 uppercase tracking-wider text-right">{t.remainingCapital}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-50/50">
                    {results.yearlyProjections.filter((_, i) => i % 5 === 0 || i === 0).map((row) => (
                      <tr key={row.year} className="hover:bg-orange-50/50 transition-colors">
                        <td className="py-3 font-mono text-orange-400">{row.year === 0 ? t.start : `${t.year} ${row.year}`}</td>
                        <td className="py-3 font-medium text-orange-900">{row.age}</td>
                        <td className="py-3 text-right font-mono text-orange-900">{Math.round(row.withdrawal).toLocaleString()}</td>
                        <td className="py-3 text-right font-mono font-bold text-orange-600">{Math.round(row.remainingCapital).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-[10px] text-orange-300 italic">
                * {t.disclaimer.split(': ')[1]}
              </p>
            </Card>


            {/* Stress Test */}
            <Card title={t.stressTest} icon={Zap} className="bg-amber-50 border-amber-100">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900 mb-1">{t.stressTestTitle}</h4>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {t.stressTestDesc}
                  </p>
                </div>
              </div>
            </Card>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-orange-100 bg-white py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">{t.sustainabilityFirst}</span>
          </div>
          <p className="text-[10px] text-orange-300 text-center md:text-right max-w-md leading-relaxed">
            {t.disclaimer}
          </p>
        </div>
      </footer>

      <AnimatePresence>
        {selectedInvestment && (
          <DetailedInvestmentModal 
            investment={selectedInvestment} 
            onClose={() => setSelectedInvestment(null)} 
            onAddHistory={(amount, date) => recordInvestmentHistory(selectedInvestment.id, amount, date)}
            onDeleteHistory={async (uId) => {
              await deleteInvestmentHistoryEntry(selectedInvestment.id, uId);
              alert(lang === 'th' ? 'ลบรายการสำเร็จ!' : 'Deleted successfully!');
            }}
            t={t}
            lang={lang}
          />
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}
