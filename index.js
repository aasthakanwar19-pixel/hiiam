// --- Imports and Setup ---
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('@supabase/supabase-js');

// --- INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Initialize Gemini AI ---
if (!process.env.GEMINI_API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not defined in your .env file.");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Initialize Supabase Client ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("FATAL ERROR: Supabase URL or Key is not defined in your .env file.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);


// --- MIDDLEWARE & FILE SETUP ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'frontend')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// --- API ROUTES ---

// GET ALL DATA FOR A SECTION
app.get('/api/data/:section', async (req, res) => {
    try {
        const { section } = req.params;
        const [
            { data: teachers, error: te },
            { data: students, error: se },
            { data: announcements, error: ae },
            { data: materials, error: me },
            { data: timetables, error: tte }
        ] = await Promise.all([
            supabase.from('teachers').select('*').eq('section', section),
            supabase.from('students').select('*').eq('section', section),
            supabase.from('announcements').select('*').in('section', [section, 'all']).order('created_at', { ascending: false }),
            supabase.from('materials').select('*').eq('section', section),
            supabase.from('timetables').select('*').eq('section', section)
        ]);
        
        if (te || se || ae || me || tte) throw (te || se || ae || me || tte);

        const data = {
            teachers: { [section]: teachers },
            students: { [section]: students },
            announcements: announcements,
            materials: { [section]: materials },
            timetables: { [section]: timetables },
            fees: { amount: 5000, recipient: "Hardik Bhandari" }
        };
        res.json(data);
    } catch (error) {
        console.error('Error fetching data from Supabase:', error);
        res.status(500).json({ error: error.message });
    }
});

// STUDENTS API
app.post('/api/students', async (req, res) => {
    try {
        const { error } = await supabase.from('students').insert([req.body]);
        if (error) throw error;
        res.status(201).json({ message: 'Student created' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.patch('/api/students/:roll', async (req, res) => {
    try {
        const { roll } = req.params;
        const { error } = await supabase.from('students').update(req.body).eq('roll', roll);
        if (error) throw error;
        res.status(200).json({ message: 'Student updated' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/students/:roll', async (req, res) => {
    try {
        const { roll } = req.params;
        const { error } = await supabase.from('students').delete().eq('roll', roll);
        if (error) throw error;
        res.status(200).json({ message: 'Student deleted' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ANNOUNCEMENTS API
app.post('/api/announcements', async (req, res) => {
    try {
        const { error } = await supabase.from('announcements').insert([req.body]);
        if (error) throw error;
        res.status(201).json({ message: 'Announcement created' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/announcements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ message: 'Announcement deleted' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});


// --- Existing AI, File Upload, and WhatsApp Routes ---

app.post('/api/ai/generate', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        res.json({ text });
    } catch (error) {
        console.error("AI Generation Error:", error);
        res.status(500).json({ error: "Failed to generate AI response." });
    }
});

app.post('/api/materials/upload', upload.single('materialFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

app.post('/api/whatsapp/send', (req, res) => {
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: '"to" and "text" fields are required.' });
    console.log(`--- SIMULATING WHATSAPP MESSAGE ---\nTo: ${to}\nMessage: ${text}\n---------------------------------`);
    res.json({ success: true, message: `Message simulation to ${to} was successful.` });
});

app.post('/api/verify-payment', async (req, res) => {
    try {
        const { mimeType, imageData, studentDetails } = req.body;
        if (!mimeType || !imageData || !studentDetails) return res.status(400).json({ error: "Missing data for verification." });
        const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
        const prompt = `
            You are an AI payment verification assistant. Analyze the payment screenshot.
            Compare it against these details:
            - Student Name: ${studentDetails.name}
            - Expected Amount: INR ${studentDetails.expectedAmount}
            - Expected Recipient: ${studentDetails.expectedRecipient}
            Provide a short summary starting with **VERIFIED:**, **UNVERIFIED - MISMATCH:**, or **UNVER