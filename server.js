const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY
  });
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Crear publicación o respuesta
app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const { content, parent_id } = req.body;
    let imageUrl = null;

    if (req.file) {
      const fileName = `${Date.now()}_${req.file.originalname}`;
      const { error: fileError } = await supabase.storage
        .from('publicaciones')
        .upload(fileName, req.file.buffer, { 
          contentType: req.file.mimetype,
          upsert: true 
        });

      if (fileError) throw fileError;

      // Obtener URL pública directa del archivo subido
      const { data: publicUrlData } = supabase.storage
        .from('publicaciones')
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabase
      .from('posts')
      .insert([{ 
        content: content || '', 
        image_url: imageUrl, 
        likes: 0, 
        dislikes: 0,
        parent_id: parent_id || null,
        is_pinned: false
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener todas las publicaciones (fijadas primero, luego por fecha)
app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fijar / desfijar publicación (solo admin)
app.post('/api/posts/:id/pin', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pinned } = req.body;

    const { data, error } = await supabase
      .from('posts')
      .update({ is_pinned: is_pinned })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar Voto
app.post('/api/posts/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, action } = req.body;

    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('likes, dislikes')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    let updates = {};
    if (type === 'like') {
      const newLikes = action === 'add' ? post.likes + 1 : Math.max(0, post.likes - 1);
      updates = { likes: newLikes };
    } else if (type === 'dislike') {
      const newDislikes = action === 'add' ? post.dislikes + 1 : Math.max(0, post.dislikes - 1);
      updates = { dislikes: newDislikes };
    }

    const { data, error: updateError } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select();

    if (updateError) throw updateError;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en el puerto ${PORT}`));
  
