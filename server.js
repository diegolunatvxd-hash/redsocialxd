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

// Helper para subir archivos
async function uploadToStorage(file, folder) {
  const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
  const fileName = `${Date.now()}_${cleanName}`;
  const { error } = await supabase.storage
    .from('publicaciones')
    .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

  if (error) throw error;
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/publicaciones/${fileName}`;
}

// Registro Payload Plus
app.post('/api/auth/register', upload.single('avatar'), async (req, res) => {
  try {
    const { username, password } = req.body;
    let avatarUrl = null;

    if (req.file) {
      avatarUrl = await uploadToStorage(req.file);
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([{ username, password, avatar_url: avatarUrl }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(400).json({ error: 'Nombre de usuario no disponible u otro error' });
  }
});

// Login Payload Plus
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) return res.status(401).json({ error: 'Credenciales inválidas' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear publicación o respuesta
app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const { content, parent_id, mode, author_id } = req.body;
    let imageUrl = null;

    if (req.file) {
      imageUrl = await uploadToStorage(req.file);
    }

    const { data, error } = await supabase
      .from('posts')
      .insert([{ 
        content: content || '', 
        image_url: imageUrl, 
        likes: 0, 
        dislikes: 0,
        parent_id: parent_id || null,
        mode: mode || 'payload',
        author_id: author_id || null,
        is_pinned: false
      }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener publicaciones filtradas por modo (payload vs plus)
app.get('/api/posts', async (req, res) => {
  try {
    const mode = req.query.mode || 'payload';
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(username, avatar_url)')
      .eq('mode', mode)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Borrar publicación (solo Admin)
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fijar/Desfijar
app.post('/api/posts/:id/pin', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pinned } = req.body;
    const { data, error } = await supabase
      .from('posts')
      .update({ is_pinned })
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
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
