from flask import Flask, jsonify, request, render_template, g, redirect, send_from_directory
from flask_cors import CORS
import sqlite3
import os
import json
import uuid
from datetime import datetime

DATABASE = os.getenv('DATABASE_PATH', os.path.join('data', 'fretlog.db'))

app = Flask(__name__)
CORS(app)

# Read version from file
VERSION_FILE = os.path.join(os.path.dirname(__file__), 'VERSION')
try:
    with open(VERSION_FILE, 'r') as f:
        APP_VERSION = f.read().strip()
except Exception as e:
    print(f"Warning: Could not read VERSION file: {e}")
    APP_VERSION = '0.0.0'

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        # ensure directory exists
        os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def dict_from_row(row):
    return dict(row) if row else None

def generate_id():
    return str(uuid.uuid4())

def init_db():
    # ensure directory exists
    os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Tables
    cursor.execute('DROP TABLE IF EXISTS users')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT, type TEXT, icon TEXT, color TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS instruments (
        id TEXT PRIMARY KEY, name TEXT, icon TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS artists (
        id TEXT PRIMARY KEY, name TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS library_items (
        id TEXT PRIMARY KEY, name TEXT, category_id TEXT, artist_id TEXT, 
        star_rating INTEGER, notes TEXT, created_at TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, instrument_id TEXT, status TEXT, date TEXT, 
        start_time TEXT, end_time TEXT, total_time INTEGER, notes TEXT, created_at TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS session_items (
        id TEXT PRIMARY KEY, session_id TEXT, library_item_id TEXT, name TEXT, 
        category_id TEXT, time_spent INTEGER, started_at TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT)''')
    
    # Default data if empty
    cursor.execute('SELECT count(*) FROM instruments')
    if cursor.fetchone()[0] == 0:
        init_default_data(conn)
        
    conn.commit()
    conn.close()

def init_default_data(conn):
    cursor = conn.cursor()
    
    # Default Categories
    cats = [
        ('cat-ear-training', 'Ear Training', 'Ear Training', '👂', '#f59e0b'),
        ('cat-lesson', 'Lesson', 'Lesson', '🎓', '#3b82f6'),
        ('cat-song', 'Song', 'Song', '🎵', '#4f46e5'),
        ('cat-technique', 'Technique', 'Technique', '💪', '#10b981'),
        ('cat-theory', 'Theory', 'Theory', '📚', '#8b5cf6')
    ]
    for cat_id, name, type_val, icon, color in cats:
        cursor.execute('INSERT INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
                       (cat_id, name, type_val, icon, color))
    
    # Default Instruments
    insts = [
        ('inst-bass', 'Bass', '🎸'), 
        ('inst-drums', 'Drums', '🥁'),
        ('inst-guitar', 'Guitar', '🎸'), 
        ('inst-piano', 'Piano', '🎹')
    ]
    for inst_id, name, icon in insts:
        cursor.execute('INSERT INTO instruments (id, name, icon) VALUES (?, ?, ?)',
                       (inst_id, name, icon))
    
    # Set default instrument
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_instrument_id', ?)", ('inst-guitar',))
    
    conn.commit()

@app.context_processor
def inject_user():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get Current Instrument ID from settings
        cursor.execute("SELECT value FROM settings WHERE key='default_instrument_id'")
        row = cursor.fetchone()
        instrument_id = row[0] if row else 'inst-guitar'
        
        # Get Current Instrument
        instrument = None
        cursor.execute('SELECT * FROM instruments WHERE id=?', (instrument_id,))
        inst_row = cursor.fetchone()
        if inst_row:
            instrument = dict(inst_row)
        
        # current_user is now a dummy object for template compatibility
        user = {'id': 'local-user', 'name': 'Musician'}
        
        return dict(current_user=user, current_instrument=instrument, APP_VERSION=APP_VERSION)
    except Exception as e:
        print(f"Error injecting user context: {e}")
        return dict(current_user=None, current_instrument=None, APP_VERSION=APP_VERSION)

# ==========================================
# Page Routes
# ==========================================
@app.route('/')
def index():
    return render_template('index.html', active_page='dashboard')

@app.route('/sessions')
def sessions():
    return render_template('sessions.html', active_page='sessions')

@app.route('/library')
def library():
    return render_template('library.html', active_page='library')

@app.route('/statistics')
def statistics():
    return render_template('statistics.html', active_page='statistics')

@app.route('/settings')
def settings():
    return render_template('settings.html', active_page='settings')

@app.route('/static/<path:filename>')
def serve_static_assets(filename):
    return send_from_directory('static', filename)

@app.route('/version.js')
def serve_version():
    """Serve the application version as a global JS constant"""
    return f"const APP_VERSION = '{APP_VERSION}';", 200, {'Content-Type': 'application/javascript'}

@app.route('/<path:filename>')
def serve_legacy_html(filename):
    # Support legacy .html links if any, redirect to clean routes
    if filename.endswith('.html'):
        base = filename[:-5]
        if base == 'index': return redirect('/')
        return redirect('/' + base)
    return send_from_directory('.', filename)


# ==========================================
# Init API - Single endpoint for all startup data
# ==========================================
@app.route('/api/init', methods=['GET'])
def get_init_data():
    """Return all initialization data in a single request for faster page loads"""
    conn = get_db()
    cursor = conn.cursor()
    
    # User (Dummy for compatibility)
    user = {'id': 'local-user', 'name': 'Musician'}
    cursor.execute("SELECT value FROM settings WHERE key='default_instrument_id'")
    inst_row = cursor.fetchone()
    user['default_instrument_id'] = inst_row[0] if inst_row else 'inst-guitar'
    
    # Categories
    cursor.execute('SELECT * FROM categories')
    categories = [dict_from_row(row) for row in cursor.fetchall()]
    
    # Instruments
    cursor.execute('SELECT * FROM instruments')
    instruments = [dict_from_row(row) for row in cursor.fetchall()]
    
    # Artists
    cursor.execute('SELECT * FROM artists')
    artists = [dict_from_row(row) for row in cursor.fetchall()]
    
    # Library items
    cursor.execute('SELECT * FROM library_items ORDER BY created_at DESC')
    library = [dict_from_row(row) for row in cursor.fetchall()]
    
    # Sessions (completed only)
    cursor.execute('SELECT * FROM sessions WHERE status="completed" ORDER BY date DESC')
    sessions = []
    for row in cursor.fetchall():
        session = dict_from_row(row)
        cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session['id'],))
        session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
        sessions.append(session)
    
    # Current session (running)
    cursor.execute('SELECT * FROM sessions WHERE status="running" ORDER BY created_at DESC LIMIT 1')
    current_session_row = cursor.fetchone()
    current_session = None
    if current_session_row:
        current_session = dict_from_row(current_session_row)
        cursor.execute('SELECT * FROM session_items WHERE session_id=?', (current_session['id'],))
        current_session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
    
    # Theme
    cursor.execute("SELECT value FROM settings WHERE key='theme'")
    theme_row = cursor.fetchone()
    theme = theme_row[0] if theme_row else 'dark'
    
    return jsonify({
        'user': user,
        'categories': categories,
        'instruments': instruments,
        'artists': artists,
        'library': library,
        'sessions': sessions,
        'currentSession': current_session,
        'theme': theme
    })

# ==========================================
# User API
# ==========================================
@app.route('/api/user', methods=['GET'])
def get_user():
    user = {'id': 'local-user', 'name': 'Musician'}
    return jsonify(user)

@app.route('/api/user', methods=['POST', 'PUT'])
def update_user():
    # Users table is gone, just return dummy
    return jsonify({'id': 'local-user', 'name': 'Musician'})

# ==========================================
# Categories API
# ==========================================
@app.route('/api/categories', methods=['GET'])
def get_categories():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM categories')
    categories = [dict_from_row(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(categories)

@app.route('/api/categories', methods=['POST'])
def add_category():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    cat_id = data.get('id') or generate_id()
    
    # Check if exists (for restore/import scenarios)
    cursor.execute('SELECT * FROM categories WHERE id=?', (cat_id,))
    if cursor.fetchone():
         # Update if exists? Or skip? For now let's update or just return existing
         pass 
         # We'll just try insert and let it fail or use INSERT OR REPLACE if we wanted
         # But simpler:
    
    # Use INSERT OR REPLACE to handle re-seeding same IDs
    cursor.execute('''
        INSERT OR REPLACE INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)
    ''', (cat_id, data.get('name'), data.get('type'), data.get('icon', '🎵'), data.get('color')))
    
    conn.commit()
    cursor.execute('SELECT * FROM categories WHERE id=?', (cat_id,))
    category = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(category), 201

@app.route('/api/categories/<cat_id>', methods=['PUT'])
def update_category(cat_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE categories SET name=?, type=?, icon=?, color=? WHERE id=?
    ''', (data.get('name'), data.get('type'), data.get('icon'), data.get('color'), cat_id))
    
    conn.commit()
    cursor.execute('SELECT * FROM categories WHERE id=?', (cat_id,))
    category = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(category)

@app.route('/api/categories/<cat_id>', methods=['DELETE'])
def delete_category(cat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM categories WHERE id=?', (cat_id,))
    conn.commit()
    conn.close()
    return '', 204

# ==========================================
# Instruments API
# ==========================================
@app.route('/api/instruments', methods=['GET'])
def get_instruments():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM instruments')
    instruments = [dict_from_row(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(instruments)

@app.route('/api/instruments', methods=['POST'])
def add_instrument():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    inst_id = data.get('id') or generate_id()
    
    cursor.execute('''
        INSERT OR REPLACE INTO instruments (id, name, icon) VALUES (?, ?, ?)
    ''', (inst_id, data.get('name'), data.get('icon', '🎸')))
    
    conn.commit()
    cursor.execute('SELECT * FROM instruments WHERE id=?', (inst_id,))
    instrument = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(instrument), 201

@app.route('/api/instruments/<inst_id>', methods=['PUT'])
def update_instrument(inst_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE instruments SET name=?, icon=? WHERE id=?
    ''', (data.get('name'), data.get('icon'), inst_id))
    
    conn.commit()
    cursor.execute('SELECT * FROM instruments WHERE id=?', (inst_id,))
    instrument = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(instrument)

@app.route('/api/instruments/<inst_id>', methods=['DELETE'])
def delete_instrument(inst_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM instruments WHERE id=?', (inst_id,))
    conn.commit()
    conn.close()
    return '', 204

# ==========================================
# Artists API
# ==========================================
@app.route('/api/artists', methods=['GET'])
def get_artists():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM artists')
    artists = [dict_from_row(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(artists)

@app.route('/api/artists', methods=['POST'])
def add_artist():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if artist exists
    cursor.execute('SELECT * FROM artists WHERE LOWER(name)=LOWER(?)', (data.get('name'),))
    existing = cursor.fetchone()
    
    if existing:
        conn.close()
        return jsonify(dict_from_row(existing))
    
    artist_id = generate_id()
    cursor.execute('INSERT INTO artists (id, name) VALUES (?, ?)', 
                   (artist_id, data.get('name')))
    
    conn.commit()
    cursor.execute('SELECT * FROM artists WHERE id=?', (artist_id,))
    artist = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(artist), 201

@app.route('/api/artists/<artist_id>', methods=['DELETE'])
def delete_artist(artist_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM artists WHERE id=?', (artist_id,))
    conn.commit()
    conn.close()
    return '', 204

@app.route('/api/artists/<artist_id>', methods=['PUT', 'POST'])
def update_artist(artist_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE artists SET name=? WHERE id=?', (data.get('name'), artist_id))
    conn.commit()
    cursor.execute('SELECT * FROM artists WHERE id=?', (artist_id,))
    artist = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(artist)

# ==========================================
# Library API
# ==========================================
@app.route('/api/library', methods=['GET'])
def get_library():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM library_items ORDER BY created_at DESC')
    items = [dict_from_row(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(items)

@app.route('/api/library', methods=['POST'])
def add_library_item():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    item_id = generate_id()
    cursor.execute('''
        INSERT INTO library_items (id, name, category_id, artist_id, star_rating, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (item_id, data.get('name'), data.get('categoryId'), data.get('artistId'),
          data.get('starRating', 0), data.get('notes', ''), datetime.now().isoformat()))
    
    conn.commit()
    cursor.execute('SELECT * FROM library_items WHERE id=?', (item_id,))
    item = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(item), 201

@app.route('/api/library/<item_id>', methods=['PUT'])
def update_library_item(item_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    # Map frontend camelCase to backend snake_case
    field_map = {
        'name': 'name',
        'categoryId': 'category_id',
        'artistId': 'artist_id',
        'starRating': 'star_rating',
        'notes': 'notes'
    }
    
    update_fields = []
    values = []
    
    for key, col in field_map.items():
        if key in data:
            update_fields.append(f"{col}=?")
            values.append(data[key])
    
    if update_fields:
        values.append(item_id)
        query = f"UPDATE library_items SET {', '.join(update_fields)} WHERE id=?"
        cursor.execute(query, tuple(values))
        conn.commit()
    
    cursor.execute('SELECT * FROM library_items WHERE id=?', (item_id,))
    item = dict_from_row(cursor.fetchone())
    conn.close()
    return jsonify(item)

@app.route('/api/library/<item_id>', methods=['DELETE'])
def delete_library_item(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM library_items WHERE id=?', (item_id,))
    conn.commit()
    conn.close()
    return '', 204

# ==========================================
# Sessions API
# ==========================================
@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM sessions WHERE status="completed" ORDER BY date DESC')
    sessions = []
    
    for row in cursor.fetchall():
        session = dict_from_row(row)
        # Get session items
        cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session['id'],))
        session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
        sessions.append(session)
    
    conn.close()
    return jsonify(sessions)

@app.route('/api/sessions', methods=['POST'])
def add_session():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    session_id = data.get('id') or generate_id()
    
    # Check if session already exists
    cursor.execute('SELECT id FROM sessions WHERE id=?', (session_id,))
    exists = cursor.fetchone()
    
    if exists:
        print(f"DEBUG: Session {session_id} exists. Updating...")
        # Update existing session
        cursor.execute('''
            UPDATE sessions SET instrument_id=?, status=?, date=?, start_time=?, end_time=?, 
            total_time=?, notes=? WHERE id=?
        ''', (data.get('instrumentId'), data.get('status', 'completed'),
              data.get('date', datetime.now().isoformat()), data.get('startTime'),
              data.get('endTime'), data.get('totalTime', 0), data.get('notes', ''), session_id))
        
        # Delete old items and re-insert
        print(f"DEBUG: Deleting items for session {session_id}")
        cursor.execute('DELETE FROM session_items WHERE session_id=?', (session_id,))
        print(f"DEBUG: Deleted {cursor.rowcount} items")
    else:
        print(f"DEBUG: Creating new session {session_id}")
        # Insert new session
        cursor.execute('''
            INSERT INTO sessions (id, instrument_id, status, date, start_time, end_time, total_time, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (session_id, data.get('instrumentId'), data.get('status', 'completed'),
              data.get('date', datetime.now().isoformat()), data.get('startTime'),
              data.get('endTime'), data.get('totalTime', 0), data.get('notes', ''),
              datetime.now().isoformat()))
    
    # Add session items
    items = data.get('items', [])

    for item in items:
        item_id = item.get('id') or generate_id()
        # Handle both camelCase and snake_case keys
        lib_id = item.get('libraryItemId') or item.get('library_item_id')
        cat_id = item.get('categoryId') or item.get('category_id')
        started_at = item.get('startedAt') or item.get('started_at')
        time_spent = item.get('timeSpent', 0) if item.get('timeSpent') is not None else item.get('time_spent', 0)

        # DEBUG: Check for collision
        cursor.execute("SELECT session_id FROM session_items WHERE id=?", (item_id,))
        existing_collision = cursor.fetchone()
        if existing_collision:
            print(f"DEBUG: Item {item_id} ALREADY EXISTS in session {existing_collision[0]}")
            # If it belongs to a different session, this is a logic error in our app
            # But the UNIQUE constraint will fail regardless.
            # We must DELETE it by ID to proceed safely, implying session_id mismatch
            cursor.execute("DELETE FROM session_items WHERE id=?", (item_id,))
            print(f"DEBUG: Force deleted item {item_id} to resolve collision")

        cursor.execute('''
            INSERT INTO session_items (id, session_id, library_item_id, name, category_id, time_spent, started_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (item_id, session_id, lib_id, item.get('name'),
              cat_id, time_spent, started_at))
    
    conn.commit()
    
    cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
    session = dict_from_row(cursor.fetchone())
    cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
    session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
    
    conn.close()
    return jsonify(session), 201

@app.route('/api/sessions/<session_id>', methods=['PUT'])
def update_session(session_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    # Update session record
    cursor.execute('''
        UPDATE sessions SET instrument_id=?, status=?, date=?, total_time=?, notes=?, end_time=?
        WHERE id=?
    ''', (data.get('instrumentId'), data.get('status'), data.get('date'),
          data.get('totalTime'), data.get('notes'), data.get('endTime'), session_id))
    
    # Delete old items and re-insert new ones
    cursor.execute('DELETE FROM session_items WHERE session_id=?', (session_id,))
    
    # Add session items
    items = data.get('items', [])
    for item in items:
        item_id = item.get('id') or generate_id()
        # Handle both camelCase and snake_case keys
        lib_id = item.get('libraryItemId') or item.get('library_item_id')
        cat_id = item.get('categoryId') or item.get('category_id')
        started_at = item.get('startedAt') or item.get('started_at')
        time_spent = item.get('timeSpent', 0) if item.get('timeSpent') is not None else item.get('time_spent', 0)
        
        cursor.execute('''
            INSERT INTO session_items (id, session_id, library_item_id, name, category_id, time_spent, started_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (item_id, session_id, lib_id, item.get('name'),
              cat_id, time_spent, started_at))
    
    conn.commit()
    cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
    session = dict_from_row(cursor.fetchone())
    cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
    session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
    
    conn.close()
    return jsonify(session)

@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM session_items WHERE session_id=?', (session_id,))
    cursor.execute('DELETE FROM sessions WHERE id=?', (session_id,))
    conn.commit()
    conn.close()
    return '', 204

# ==========================================
# Current Session API
# ==========================================
@app.route('/api/sessions/current', methods=['GET'])
def get_current_session():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT value FROM settings WHERE key='current_session'")
    result = cursor.fetchone()
    
    if not result or not result[0]:
        conn.close()
        return jsonify(None)
    
    session_id = result[0]
    cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
    session = cursor.fetchone()
    
    if not session:
        conn.close()
        return jsonify(None)
    
    session = dict_from_row(session)
    cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
    session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
    
    conn.close()
    return jsonify(session)

@app.route('/api/sessions/current', methods=['POST'])
def save_current_session():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    session_id = data.get('id') or generate_id()
    
    # Check if session already exists
    cursor.execute('SELECT id FROM sessions WHERE id=?', (session_id,))
    exists = cursor.fetchone()
    
    if exists:
        # Update existing session
        cursor.execute('''
            UPDATE sessions SET instrument_id=?, status=?, date=?, start_time=?, 
            total_time=?, notes=? WHERE id=?
        ''', (data.get('instrumentId'), data.get('status', 'running'),
              data.get('date'), data.get('startTime'), data.get('totalTime', 0),
              data.get('notes', ''), session_id))
        
        # Delete old items and re-insert
        cursor.execute('DELETE FROM session_items WHERE session_id=?', (session_id,))
    else:
        # Create new session
        cursor.execute('''
            INSERT INTO sessions (id, instrument_id, status, date, start_time, total_time, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (session_id, data.get('instrumentId'), data.get('status', 'running'),
              data.get('date', datetime.now().isoformat()), data.get('startTime'),
              data.get('totalTime', 0), data.get('notes', ''), datetime.now().isoformat()))
    
    # Insert session items
    items = data.get('items', [])

    for item in items:
        item_id = item.get('id') or generate_id()
        # Handle both camelCase and snake_case keys
        lib_id = item.get('libraryItemId') or item.get('library_item_id')
        cat_id = item.get('categoryId') or item.get('category_id')
        started_at = item.get('startedAt') or item.get('started_at')
        time_spent = item.get('timeSpent', 0) if item.get('timeSpent') is not None else item.get('time_spent', 0)

        cursor.execute('''
            INSERT INTO session_items (id, session_id, library_item_id, name, category_id, time_spent, started_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (item_id, session_id, lib_id, item.get('name'),
              cat_id, time_spent, started_at))
    
    # Store current session reference
    cursor.execute('''
        INSERT OR REPLACE INTO settings (key, value) VALUES ('current_session', ?)
    ''', (session_id,))
    
    conn.commit()
    
    cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
    session = dict_from_row(cursor.fetchone())
    cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
    session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
    
    conn.close()
    return jsonify(session)

@app.route('/api/sessions/current', methods=['DELETE'])
def clear_current_session():
    conn = get_db()
    cursor = conn.cursor()
    
    # Get current session ID
    cursor.execute("SELECT value FROM settings WHERE key='current_session'")
    result = cursor.fetchone()
    
    if result and result[0]:
        session_id = result[0]
        
        # Check status first - only delete if it's still running (cancelling)
        # If it's already 'completed', it means we successfully saved it, so DON'T delete the data
        cursor.execute("SELECT status FROM sessions WHERE id=?", (session_id,))
        row = cursor.fetchone()
        
        if row and row[0] == 'running':
            cursor.execute('DELETE FROM session_items WHERE session_id=?', (session_id,))
            cursor.execute("DELETE FROM sessions WHERE id=?", (session_id,))
    
    # Clear current session reference
    cursor.execute("DELETE FROM settings WHERE key='current_session'")
    conn.commit()
    conn.close()
    return '', 204

@app.route('/api/sessions/current/items', methods=['POST'])
def add_item_to_current_session():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    # Get current session
    cursor.execute("SELECT value FROM settings WHERE key='current_session'")
    result = cursor.fetchone()
    
    if not result or not result[0]:
        conn.close()
        return jsonify({'error': 'No current session'}), 400
    
    session_id = result[0]
    
    # Get library item info
    cursor.execute('SELECT * FROM library_items WHERE id=?', (data.get('libraryItemId'),))
    library_item = cursor.fetchone()
    
    if not library_item:
        conn.close()
        return jsonify({'error': 'Library item not found'}), 404
    
    library_item = dict_from_row(library_item)
    
    item_id = generate_id()
    cursor.execute('''
        INSERT INTO session_items (id, session_id, library_item_id, name, category_id, time_spent, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (item_id, session_id, library_item['id'], library_item['name'],
          library_item['category_id'], data.get('timeSpent', 0), 
          data.get('startedAt') or int(datetime.now().timestamp() * 1000)))
    
    conn.commit()
    
    # Return updated session
    cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
    session = dict_from_row(cursor.fetchone())
    cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
    session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
    
    conn.close()
    return jsonify(session)

@app.route('/api/sessions/current/items/<item_id>', methods=['PUT'])
def update_session_item_time(item_id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('UPDATE session_items SET time_spent=? WHERE id=?',
                   (data.get('timeSpent', 0), item_id))
    conn.commit()
    
    # Return updated current session
    cursor.execute("SELECT value FROM settings WHERE key='current_session'")
    result = cursor.fetchone()
    
    if result and result[0]:
        session_id = result[0]
        cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
        session = dict_from_row(cursor.fetchone())
        cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
        session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
        conn.close()
        return jsonify(session)
    
    conn.close()
    return jsonify(None)

# ==========================================
# Theme API
# ==========================================
@app.route('/api/theme', methods=['GET'])
def get_theme():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key='theme'")
    result = cursor.fetchone()
    conn.close()
    return jsonify({'theme': result[0] if result else 'light'})

@app.route('/api/theme', methods=['POST'])
def set_theme():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)
    ''', (data.get('theme', 'light'),))
    conn.commit()
    conn.close()
    return jsonify({'theme': data.get('theme')})

@app.route('/api/settings', methods=['POST'])
def update_setting():
    data = request.json
    key = data.get('key')
    value = data.get('value')
    
    if not key:
        return jsonify({'error': 'Missing key'}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    ''', (key, value))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success', 'key': key, 'value': value})

# ==========================================
# Statistics API
# ==========================================
@app.route('/api/statistics/summary', methods=['GET'])
def get_statistics_summary():
    conn = get_db()
    cursor = conn.cursor()
    
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    # Calculate week start (Sunday)
    days_since_sunday = now.weekday() + 1 if now.weekday() != 6 else 0
    week_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    week_start = (week_start - timedelta(days=days_since_sunday)).isoformat()
    
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    def get_time_in_range(start):
        cursor.execute('''
            SELECT COALESCE(SUM(total_time), 0) FROM sessions 
            WHERE status='completed' AND date >= ?
        ''', (start,))
        return cursor.fetchone()[0]
    
    cursor.execute('SELECT COALESCE(SUM(total_time), 0) FROM sessions WHERE status="completed"')
    all_time = cursor.fetchone()[0]
    
    summary = {
        'today': get_time_in_range(today_start),
        'week': get_time_in_range(week_start),
        'month': get_time_in_range(month_start),
        'year': get_time_in_range(year_start),
        'allTime': all_time
    }
    
    conn.close()
    return jsonify(summary)

# = = = = = = = = = = = = = = = = = = = = = =
# Data Management API
# = = = = = = = = = = = = = = = = = = = = = =

@app.route('/api/export', methods=['GET'])
def export_data():
    """Export all database tables to JSON"""
    conn = get_db()
    cursor = conn.cursor()
    
    tables = ['categories', 'instruments', 'artists', 'library_items', 'sessions', 'session_items', 'settings']
    export = {}
    
    for table in tables:
        cursor.execute(f'SELECT * FROM {table}')
        export[table] = [dict_from_row(row) for row in cursor.fetchall()]
    
    conn.close()
    return jsonify(export)

@app.route('/api/import', methods=['POST'])
def import_data():
    """Import data from JSON with duplicate prevention"""
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # 1. Categories - Dedup by name
        if 'categories' in data:
            for cat in data['categories']:
                # Check for existing by name
                cursor.execute('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', (cat['name'],))
                existing = cursor.fetchone()
                target_id = existing[0] if existing else cat['id']
                
                cursor.execute('INSERT OR REPLACE INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
                               (target_id, cat['name'], cat['type'], cat.get('icon', '🎵'), cat.get('color')))
        
        # 2. Instruments - Dedup by name
        if 'instruments' in data:
            for inst in data['instruments']:
                cursor.execute('SELECT id FROM instruments WHERE LOWER(name) = LOWER(?)', (inst['name'],))
                existing = cursor.fetchone()
                target_id = existing[0] if existing else inst['id']
                
                cursor.execute('INSERT OR REPLACE INTO instruments (id, name, icon) VALUES (?, ?, ?)',
                               (target_id, inst['name'], inst.get('icon', '🎸')))
        
        # 3. Artists
        if 'artists' in data:
            for artist in data['artists']:
                cursor.execute('SELECT id FROM artists WHERE LOWER(name) = LOWER(?)', (artist['name'],))
                existing = cursor.fetchone()
                target_id = existing[0] if existing else artist['id']
                
                cursor.execute('INSERT OR REPLACE INTO artists (id, name) VALUES (?, ?)',
                               (target_id, artist['name']))
        
        # 4. Library Items
        if 'library_items' in data:
            for item in data['library_items']:
                cursor.execute('''
                    INSERT OR REPLACE INTO library_items (id, name, category_id, artist_id, star_rating, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (item['id'], item['name'], item.get('category_id'), item.get('artist_id'),
                      item.get('star_rating', 0), item.get('notes', ''), item.get('created_at')))
        
        # 5. Sessions
        if 'sessions' in data:
            for sess in data['sessions']:
                cursor.execute('''
                    INSERT OR REPLACE INTO sessions (id, instrument_id, status, date, start_time, end_time, total_time, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (sess['id'], sess.get('instrument_id'), sess.get('status'), sess['date'],
                      sess.get('start_time'), sess.get('end_time'), sess.get('total_time', 0),
                      sess.get('notes', ''), sess.get('created_at')))
        
        # 6. Session Items
        if 'session_items' in data:
            for item in data['session_items']:
                cursor.execute('''
                    INSERT OR REPLACE INTO session_items (id, session_id, library_item_id, name, category_id, time_spent, started_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (item['id'], item['session_id'], item.get('library_item_id'), item['name'],
                      item.get('category_id'), item.get('time_spent', 0), item.get('started_at')))
        
        # 7. Settings
        if 'settings' in data:
            for setting in data['settings']:
                cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                               (setting['key'], setting['value']))
        
        # 8. Table 'users' is no longer imported
        
        conn.commit()
        return jsonify({'status': 'success', 'message': 'Data imported successfully'})
    except Exception as e:
        print(f"Error importing data: {e}")
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/clear', methods=['POST'])
def clear_data():
    """Clear all data except defaults and preserved user info"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Preserve theme
        cursor.execute("SELECT value FROM settings WHERE key='theme'")
        theme_row = cursor.fetchone()
        preserved_theme = theme_row[0] if theme_row else 'dark'
        
        # Preserve instrument
        cursor.execute("SELECT value FROM settings WHERE key='default_instrument_id'")
        inst_row = cursor.fetchone()
        preserved_inst = inst_row[0] if inst_row else 'inst-guitar'
        
        # Delete everything
        cursor.execute('DELETE FROM session_items')
        cursor.execute('DELETE FROM sessions')
        cursor.execute('DELETE FROM library_items')
        cursor.execute('DELETE FROM artists')
        cursor.execute('DELETE FROM categories')
        cursor.execute('DELETE FROM instruments')
        cursor.execute('DELETE FROM settings')
        
        conn.commit()
        
        # Re-initialize with defaults
        init_default_data(conn)
        
        # Restore theme
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)", (preserved_theme,))
        
        # Restore instrument
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_instrument_id', ?)", (preserved_inst,))
        
        conn.commit()
        return jsonify({'status': 'success', 'message': 'All data cleared except defaults and profile'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def serve_sw():
    return send_from_directory('static', 'sw.js')

if __name__ == '__main__':
    with app.app_context():
        init_db()
    print("Starting FretLog server on 0.0.0.0:5000")
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=True)
