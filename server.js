const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuración de Supabase usando variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Crear publicación (texto, foto o ambos)
app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const { content } = req.body;
    let imageUrl = null;

    if (req.file) {
      const fileName = `${Date.now()}_${req.file.originalname}`;
      const { data: fileData, error: fileError } = await supabase.storage
        .from('publicaciones')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (fileError) throw fileError;

      const { data: publicUrlData } = supabase.storage
        .from('publicaciones')
        .getPublicUrl(fileName);
      
      imageUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabase
      .from('posts')
      .insert([{ content: content || '', image_url: imageUrl, likes: 0, dislikes: 0 }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener todas las publicaciones
app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dar Like o Dislike
app.post('/api/posts/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'like' o 'dislike'

    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('likes, dislikes')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const updates = type === 'like' 
      ? { likes: post.likes + 1 } 
      : { dislikes: post.dislikes + 1 };

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
