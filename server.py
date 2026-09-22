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
        database_dir = os.path.dirname(DATABASE)
        if database_dir:
            os.makedirs(database_dir, exist_ok=True)
        db = g._database = sqlite3.connect(DATABASE, timeout=10)
        db.execute('PRAGMA busy_timeout = 10000')
        db.execute('PRAGMA foreign_keys = ON')
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        if exception is not None:
            db.rollback()
        db.close()

def dict_from_row(row):
    return dict(row) if row else None

def generate_id():
    return str(uuid.uuid4())

def get_json_payload():
    """Return a JSON object or a consistent client error response."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, (jsonify({'error': 'Request body must be a JSON object'}), 400)
    return data, None

def attach_session_items(cursor, sessions):
    """Attach session items with one query for a collection of sessions."""
    if not sessions:
        return sessions

    session_ids = [session['id'] for session in sessions]
    placeholders = ','.join('?' for _ in session_ids)
    cursor.execute(
        f'SELECT * FROM session_items WHERE session_id IN ({placeholders})',
        session_ids
    )
    items_by_session = {session_id: [] for session_id in session_ids}
    for item_row in cursor.fetchall():
        item = dict_from_row(item_row)
        items_by_session[item['session_id']].append(item)
    for session in sessions:
        session['items'] = items_by_session[session['id']]
    return sessions

def validate_session_payload(data):
    status = data.get('status')
    if status is not None and status not in ('running', 'completed', 'pending'):
        return 'status must be running, completed, or pending'
    total_time = data.get('totalTime')
    if total_time is not None and (not isinstance(total_time, (int, float)) or total_time < 0):
        return 'totalTime must be a non-negative number'
    for item in data.get('items', []):
        if not isinstance(item, dict):
            return 'each session item must be an object'
        time_spent = item.get('timeSpent', item.get('time_spent', 0))
        if not isinstance(time_spent, (int, float)) or time_spent < 0:
            return 'session item timeSpent must be a non-negative number'
    return None

def migrate_foreign_keys(conn):
    """Add relational constraints to older databases without losing data."""
    cursor = conn.cursor()
    cursor.execute('PRAGMA foreign_key_list(session_items)')
    if cursor.fetchone():
        return

    # The database was previously created without constraints. The orphan audit
    # runs before this migration, so rebuilding the dependent tables is safe.
    cursor.execute('DROP INDEX IF EXISTS idx_library_items_created_at')
    cursor.execute('DROP INDEX IF EXISTS idx_sessions_status_date')
    cursor.execute('DROP INDEX IF EXISTS idx_session_items_session_id')
    cursor.execute('DROP INDEX IF EXISTS idx_session_items_library_item_id')

    cursor.execute('ALTER TABLE library_items RENAME TO library_items_old')
    cursor.execute('ALTER TABLE sessions RENAME TO sessions_old')
    cursor.execute('ALTER TABLE session_items RENAME TO session_items_old')

    cursor.execute('''CREATE TABLE library_items (
        id TEXT PRIMARY KEY, name TEXT, category_id TEXT,
        artist_id TEXT, star_rating INTEGER, notes TEXT, created_at TEXT,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL)''')
    cursor.execute('''CREATE TABLE sessions (
        id TEXT PRIMARY KEY, instrument_id TEXT, status TEXT, date TEXT,
        start_time TEXT, end_time TEXT, total_time INTEGER, notes TEXT,
        created_at TEXT,
        FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL)''')
    cursor.execute('''CREATE TABLE session_items (
        id TEXT PRIMARY KEY, session_id TEXT, library_item_id TEXT,
        name TEXT, category_id TEXT, time_spent INTEGER, started_at TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE SET NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL)''')

    cursor.execute('INSERT INTO library_items SELECT * FROM library_items_old')
    cursor.execute('INSERT INTO sessions SELECT * FROM sessions_old')
    cursor.execute('INSERT INTO session_items SELECT * FROM session_items_old')
    cursor.execute('DROP TABLE library_items_old')
    cursor.execute('DROP TABLE sessions_old')
    cursor.execute('DROP TABLE session_items_old')

def init_db():
    # ensure directory exists
    database_dir = os.path.dirname(DATABASE)
    if database_dir:
        os.makedirs(database_dir, exist_ok=True)

    conn = sqlite3.connect(DATABASE, timeout=10)
    conn.execute('PRAGMA busy_timeout = 10000')
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    cursor = conn.cursor()
    
    # Tables
    cursor.execute('''CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT, type TEXT, icon TEXT, color TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS instruments (
        id TEXT PRIMARY KEY, name TEXT, icon TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS artists (
        id TEXT PRIMARY KEY, name TEXT)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS library_items (
        id TEXT PRIMARY KEY, name TEXT, category_id TEXT, artist_id TEXT,
        star_rating INTEGER, notes TEXT, created_at TEXT,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, instrument_id TEXT, status TEXT, date TEXT,
        start_time TEXT, end_time TEXT, total_time INTEGER, notes TEXT, created_at TEXT,
        FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS session_items (
        id TEXT PRIMARY KEY, session_id TEXT, library_item_id TEXT, name TEXT,
        category_id TEXT, time_spent INTEGER, started_at TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE SET NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL)''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT)''')

    migrate_foreign_keys(conn)

    # Indexes for the read paths used by initialization, history, and statistics.
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_library_items_created_at ON library_items(created_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_status_date ON sessions(status, date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_session_items_session_id ON session_items(session_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_session_items_library_item_id ON session_items(library_item_id)')
    
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
    
    # Sessions (completed only). Pagination is opt-in for existing clients.
    session_page_requested = 'sessionLimit' in request.args or 'sessionOffset' in request.args
    try:
        session_limit = min(max(int(request.args.get('sessionLimit', 500)), 1), 500)
        session_offset = max(int(request.args.get('sessionOffset', 0)), 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'sessionLimit and sessionOffset must be integers'}), 400

    cursor.execute('SELECT COUNT(*) FROM sessions WHERE status="completed"')
    session_total = cursor.fetchone()[0]
    session_query = 'SELECT * FROM sessions WHERE status="completed" ORDER BY date DESC'
    session_params = []
    if session_page_requested:
        session_query += ' LIMIT ? OFFSET ?'
        session_params = [session_limit, session_offset]
    cursor.execute(session_query, session_params)
    session_rows = cursor.fetchall()
    sessions = [dict_from_row(row) for row in session_rows]

    sessions = attach_session_items(cursor, sessions)
    
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
        'sessionTotal': session_total,
        'sessionLimit': session_limit if session_page_requested else None,
        'sessionOffset': session_offset if session_page_requested else None,
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
    return jsonify(categories)

@app.route('/api/categories', methods=['POST'])
def add_category():
    data, error = get_json_payload()
    if error:
        return error
    if not isinstance(data.get('name'), str) or not data['name'].strip():
        return jsonify({'error': 'name is required'}), 400
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
    return jsonify(category), 201

@app.route('/api/categories/<cat_id>', methods=['PUT'])
def update_category(cat_id):
    data, error = get_json_payload()
    if error:
        return error
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE categories SET name=?, type=?, icon=?, color=? WHERE id=?
    ''', (data.get('name'), data.get('type'), data.get('icon'), data.get('color'), cat_id))

    if cursor.rowcount == 0:
        return jsonify({'error': 'Category not found'}), 404
    
    conn.commit()
    cursor.execute('SELECT * FROM categories WHERE id=?', (cat_id,))
    category = dict_from_row(cursor.fetchone())
    return jsonify(category)

@app.route('/api/categories/<cat_id>', methods=['DELETE'])
def delete_category(cat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM categories WHERE id=?', (cat_id,))
    conn.commit()
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
    return jsonify(instruments)

@app.route('/api/instruments', methods=['POST'])
def add_instrument():
    data, error = get_json_payload()
    if error:
        return error
    if not isinstance(data.get('name'), str) or not data['name'].strip():
        return jsonify({'error': 'name is required'}), 400
    conn = get_db()
    cursor = conn.cursor()
    
    inst_id = data.get('id') or generate_id()
    
    cursor.execute('''
        INSERT OR REPLACE INTO instruments (id, name, icon) VALUES (?, ?, ?)
    ''', (inst_id, data.get('name'), data.get('icon', '🎸')))
    
    conn.commit()
    cursor.execute('SELECT * FROM instruments WHERE id=?', (inst_id,))
    instrument = dict_from_row(cursor.fetchone())
    return jsonify(instrument), 201

@app.route('/api/instruments/<inst_id>', methods=['PUT'])
def update_instrument(inst_id):
    data, error = get_json_payload()
    if error:
        return error
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE instruments SET name=?, icon=? WHERE id=?
    ''', (data.get('name'), data.get('icon'), inst_id))

    if cursor.rowcount == 0:
        return jsonify({'error': 'Instrument not found'}), 404
    
    conn.commit()
    cursor.execute('SELECT * FROM instruments WHERE id=?', (inst_id,))
    instrument = dict_from_row(cursor.fetchone())
    return jsonify(instrument)

@app.route('/api/instruments/<inst_id>', methods=['DELETE'])
def delete_instrument(inst_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM instruments WHERE id=?', (inst_id,))
    conn.commit()
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
    return jsonify(artists)

@app.route('/api/artists', methods=['POST'])
def add_artist():
    data, error = get_json_payload()
    if error:
        return error
    if not isinstance(data.get('name'), str) or not data['name'].strip():
        return jsonify({'error': 'name is required'}), 400
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if artist exists
    cursor.execute('SELECT * FROM artists WHERE LOWER(name)=LOWER(?)', (data.get('name'),))
    existing = cursor.fetchone()
    
    if existing:
        return jsonify(dict_from_row(existing))
    
    artist_id = generate_id()
    cursor.execute('INSERT INTO artists (id, name) VALUES (?, ?)', 
                   (artist_id, data.get('name')))
    
    conn.commit()
    cursor.execute('SELECT * FROM artists WHERE id=?', (artist_id,))
    artist = dict_from_row(cursor.fetchone())
    return jsonify(artist), 201

@app.route('/api/artists/<artist_id>', methods=['DELETE'])
def delete_artist(artist_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM artists WHERE id=?', (artist_id,))
    conn.commit()
    return '', 204

@app.route('/api/artists/<artist_id>', methods=['PUT', 'POST'])
def update_artist(artist_id):
    data, error = get_json_payload()
    if error:
        return error
    if not isinstance(data.get('name'), str) or not data['name'].strip():
        return jsonify({'error': 'name is required'}), 400
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE artists SET name=? WHERE id=?', (data.get('name'), artist_id))
    if cursor.rowcount == 0:
        return jsonify({'error': 'Artist not found'}), 404
    conn.commit()
    cursor.execute('SELECT * FROM artists WHERE id=?', (artist_id,))
    artist = dict_from_row(cursor.fetchone())
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
    return jsonify(items)

@app.route('/api/library', methods=['POST'])
def add_library_item():
    data, error = get_json_payload()
    if error:
        return error
    name = data.get('name')
    category_id = data.get('categoryId')
    if not isinstance(name, str) or not name.strip() or not category_id:
        return jsonify({'error': 'name and categoryId are required'}), 400
    artist_id = data.get('artistId')
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Check for duplicates (case-insensitive)
    cursor.execute('''
        SELECT id FROM library_items 
        WHERE LOWER(name) = LOWER(?) AND category_id = ? AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL))
    ''', (name, category_id, artist_id, artist_id))
    
    if cursor.fetchone():
        return jsonify({'error': 'An item with this name already exists in this category.'}), 409

    item_id = generate_id()
    cursor.execute('''
        INSERT INTO library_items (id, name, category_id, artist_id, star_rating, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (item_id, name, category_id, artist_id,
          data.get('starRating', 0), data.get('notes', ''), datetime.now().isoformat()))
    
    conn.commit()
    cursor.execute('SELECT * FROM library_items WHERE id=?', (item_id,))
    item = dict_from_row(cursor.fetchone())
    return jsonify(item), 201

@app.route('/api/library/<item_id>', methods=['PUT'])
def update_library_item(item_id):
    data, error = get_json_payload()
    if error:
        return error
    conn = get_db()
    cursor = conn.cursor()

    # Check for duplicates if name/category/artist are being changed
    if any(k in data for k in ['name', 'categoryId', 'artistId']):
        cursor.execute('SELECT name, category_id, artist_id FROM library_items WHERE id=?', (item_id,))
        current = cursor.fetchone()
        if not current:
            return jsonify({'error': 'Item not found'}), 404
        
        new_name = data.get('name', current[0])
        new_cat = data.get('categoryId', current[1])
        new_art = data.get('artistId', current[2]) if 'artistId' in data else current[2]

        cursor.execute('''
            SELECT id FROM library_items 
            WHERE LOWER(name) = LOWER(?) AND category_id = ? AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL))
            AND id != ?
        ''', (new_name, new_cat, new_art, new_art, item_id))
        
        if cursor.fetchone():
            return jsonify({'error': 'An item with this name already exists in this category.'}), 409
    
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
    return jsonify(item)

@app.route('/api/library/<item_id>', methods=['DELETE'])
def delete_library_item(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM library_items WHERE id=?', (item_id,))
    conn.commit()
    return '', 204

# ==========================================
# Sessions API
# ==========================================
@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    conn = get_db()
    cursor = conn.cursor()
    try:
        limit = min(max(int(request.args.get('limit', 500)), 1), 500)
        offset = max(int(request.args.get('offset', 0)), 0)
    except (TypeError, ValueError):
        return jsonify({'error': 'limit and offset must be integers'}), 400

    cursor.execute(
        'SELECT * FROM sessions WHERE status="completed" ORDER BY date DESC LIMIT ? OFFSET ?',
        (limit, offset)
    )
    sessions = [dict_from_row(row) for row in cursor.fetchall()]
    sessions = attach_session_items(cursor, sessions)
    
    return jsonify(sessions)

@app.route('/api/sessions', methods=['POST'])
def add_session():
    data, error = get_json_payload()
    if error:
        return error
    if not isinstance(data.get('items', []), list):
        return jsonify({'error': 'items must be an array'}), 400
    session_error = validate_session_payload(data)
    if session_error:
        return jsonify({'error': session_error}), 400
    conn = get_db()
    cursor = conn.cursor()
    
    session_id = data.get('id') or generate_id()
    
    # Check if session already exists
    cursor.execute('SELECT id FROM sessions WHERE id=?', (session_id,))
    exists = cursor.fetchone()
    
    if exists:
        # Update existing session
        cursor.execute('''
            UPDATE sessions SET instrument_id=?, status=?, date=?, start_time=?, end_time=?, 
            total_time=?, notes=? WHERE id=?
        ''', (data.get('instrumentId'), data.get('status', 'completed'),
              data.get('date', datetime.now().isoformat()), data.get('startTime'),
              data.get('endTime'), data.get('totalTime', 0), data.get('notes', ''), session_id))
        
        # Delete old items and re-insert
        cursor.execute('DELETE FROM session_items WHERE session_id=?', (session_id,))
    else:
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

        cursor.execute("SELECT session_id FROM session_items WHERE id=?", (item_id,))
        existing_collision = cursor.fetchone()
        if existing_collision:
            # If it belongs to a different session, this is a logic error in our app
            # But the UNIQUE constraint will fail regardless.
            # We must DELETE it by ID to proceed safely, implying session_id mismatch
            cursor.execute("DELETE FROM session_items WHERE id=?", (item_id,))

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
    return jsonify(session), 201

@app.route('/api/sessions/<session_id>', methods=['PUT'])
def update_session(session_id):
    data, error = get_json_payload()
    if error:
        return error
    if not isinstance(data.get('items', []), list):
        return jsonify({'error': 'items must be an array'}), 400
    session_error = validate_session_payload(data)
    if session_error:
        return jsonify({'error': session_error}), 400
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM sessions WHERE id=?', (session_id,))
    if not cursor.fetchone():
        return jsonify({'error': 'Session not found'}), 404
    
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
    return jsonify(session)

@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM session_items WHERE session_id=?', (session_id,))
    cursor.execute('DELETE FROM sessions WHERE id=?', (session_id,))
    conn.commit()
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
        return jsonify(None)
    
    session_id = result[0]
    cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
    session = cursor.fetchone()
    
    if not session:
        return jsonify(None)
    
    session = dict_from_row(session)
    cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
    session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
    return jsonify(session)

@app.route('/api/sessions/current', methods=['POST'])
def save_current_session():
    data, error = get_json_payload()
    if error:
        return error
    if not isinstance(data.get('items', []), list):
        return jsonify({'error': 'items must be an array'}), 400
    session_error = validate_session_payload(data)
    if session_error:
        return jsonify({'error': session_error}), 400
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
        return jsonify({'error': 'No current session'}), 400
    
    session_id = result[0]
    
    # Get library item info
    cursor.execute('SELECT * FROM library_items WHERE id=?', (data.get('libraryItemId'),))
    library_item = cursor.fetchone()
    
    if not library_item:
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
    return jsonify(session)

@app.route('/api/sessions/current/items/<item_id>', methods=['PUT'])
def update_session_item_time(item_id):
    data, error = get_json_payload()
    if error:
        return error
    time_spent = data.get('timeSpent')
    if not isinstance(time_spent, (int, float)) or time_spent < 0:
        return jsonify({'error': 'timeSpent must be a non-negative number'}), 400
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT value FROM settings WHERE key='current_session'")
    result = cursor.fetchone()

    if not result or not result[0]:
        return jsonify({'error': 'No current session'}), 400

    session_id = result[0]
    cursor.execute(
        'UPDATE session_items SET time_spent=? WHERE id=? AND session_id=?',
        (time_spent, item_id, session_id)
    )
    if cursor.rowcount == 0:
        return jsonify({'error': 'Session item not found'}), 404
    conn.commit()

    # Return updated current session
    if session_id:
        cursor.execute('SELECT * FROM sessions WHERE id=?', (session_id,))
        session = dict_from_row(cursor.fetchone())
        cursor.execute('SELECT * FROM session_items WHERE session_id=?', (session_id,))
        session['items'] = [dict_from_row(item) for item in cursor.fetchall()]
        return jsonify(session)
    
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
    return jsonify({'theme': result[0] if result else 'light'})

@app.route('/api/theme', methods=['POST'])
def set_theme():
    data, error = get_json_payload()
    if error:
        return error
    if data.get('theme') not in ('light', 'dark'):
        return jsonify({'error': 'theme must be light or dark'}), 400
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)
    ''', (data.get('theme', 'light'),))
    conn.commit()
    return jsonify({'theme': data.get('theme')})

@app.route('/api/settings', methods=['POST'])
def update_setting():
    data, error = get_json_payload()
    if error:
        return error
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
    
    # Calculate week start (Monday), matching the frontend statistics.
    days_since_monday = now.weekday()
    week_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    week_start = (week_start - timedelta(days=days_since_monday)).isoformat()
    
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
    
    return jsonify(export)

@app.route('/api/import', methods=['POST'])
def import_data():
    """Import data from JSON with duplicate prevention"""
    data, error = get_json_payload()
    if error:
        return error

    table_names = {'categories', 'instruments', 'artists', 'library_items',
                   'sessions', 'session_items', 'settings'}
    unknown_tables = set(data) - table_names
    if unknown_tables:
        return jsonify({'error': f'Unknown data tables: {sorted(unknown_tables)}'}), 400
    if any(not isinstance(value, list) for value in data.values()):
        return jsonify({'error': 'Each imported table must be an array'}), 400
    required_fields = {
        'categories': ('id', 'name', 'type'),
        'instruments': ('id', 'name'),
        'artists': ('id', 'name'),
        'library_items': ('id', 'name'),
        'sessions': ('id', 'date'),
        'session_items': ('id', 'session_id', 'name'),
        'settings': ('key', 'value')
    }
    for table, fields in required_fields.items():
        for record in data.get(table, []):
            if not isinstance(record, dict) or any(not record.get(field) for field in fields):
                return jsonify({'error': f'Invalid record in {table}'}), 400
    for session in data.get('sessions', []):
        if not isinstance(session, dict):
            return jsonify({'error': 'Imported sessions must be objects'}), 400
        session_error = validate_session_payload(session)
        if session_error:
            return jsonify({'error': session_error}), 400
    for item in data.get('session_items', []):
        if not isinstance(item, dict):
            return jsonify({'error': 'Imported session items must be objects'}), 400
        time_spent = item.get('time_spent', 0)
        if not isinstance(time_spent, (int, float)) or time_spent < 0:
            return jsonify({'error': 'Imported session item time_spent must be non-negative'}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Resolve imported IDs to existing records without replacing rows.
        # Replacing a referenced row can trigger foreign-key actions and erase history links.
        category_ids = {}
        if 'categories' in data:
            for cat in data['categories']:
                cursor.execute('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', (cat['name'],))
                existing = cursor.fetchone()
                target_id = existing[0] if existing else cat['id']
                cursor.execute('SELECT name FROM categories WHERE id=?', (target_id,))
                if cursor.fetchone() and not existing:
                    target_id = generate_id()
                cursor.execute('''
                    INSERT INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type,
                        icon=excluded.icon, color=excluded.color
                ''', (target_id, cat['name'], cat['type'], cat.get('icon', '🎵'), cat.get('color')))
                category_ids[cat['id']] = target_id

        instrument_ids = {}
        if 'instruments' in data:
            for inst in data['instruments']:
                cursor.execute('SELECT id FROM instruments WHERE LOWER(name) = LOWER(?)', (inst['name'],))
                existing = cursor.fetchone()
                target_id = existing[0] if existing else inst['id']
                cursor.execute('SELECT name FROM instruments WHERE id=?', (target_id,))
                if cursor.fetchone() and not existing:
                    target_id = generate_id()
                cursor.execute('''
                    INSERT INTO instruments (id, name, icon) VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon
                ''', (target_id, inst['name'], inst.get('icon', '🎸')))
                instrument_ids[inst['id']] = target_id

        artist_ids = {}
        if 'artists' in data:
            for artist in data['artists']:
                cursor.execute('SELECT id FROM artists WHERE LOWER(name) = LOWER(?)', (artist['name'],))
                existing = cursor.fetchone()
                target_id = existing[0] if existing else artist['id']
                cursor.execute('SELECT name FROM artists WHERE id=?', (target_id,))
                if cursor.fetchone() and not existing:
                    target_id = generate_id()
                cursor.execute('''
                    INSERT INTO artists (id, name) VALUES (?, ?)
                    ON CONFLICT(id) DO UPDATE SET name=excluded.name
                ''', (target_id, artist['name']))
                artist_ids[artist['id']] = target_id

        library_ids = {}
        if 'library_items' in data:
            for item in data['library_items']:
                category_id = category_ids.get(item.get('category_id'), item.get('category_id'))
                artist_id = artist_ids.get(item.get('artist_id'), item.get('artist_id'))
                cursor.execute('''
                    INSERT INTO library_items (id, name, category_id, artist_id, star_rating, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET name=excluded.name, category_id=excluded.category_id,
                        artist_id=excluded.artist_id, star_rating=excluded.star_rating, notes=excluded.notes
                ''', (item['id'], item['name'], category_id, artist_id,
                      item.get('star_rating', 0), item.get('notes', ''), item.get('created_at')))
                library_ids[item['id']] = item['id']

        session_ids = {}
        if 'sessions' in data:
            for sess in data['sessions']:
                instrument_id = instrument_ids.get(sess.get('instrument_id'), sess.get('instrument_id'))
                cursor.execute('''
                    INSERT INTO sessions (id, instrument_id, status, date, start_time, end_time, total_time, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET instrument_id=excluded.instrument_id, status=excluded.status,
                        date=excluded.date, start_time=excluded.start_time, end_time=excluded.end_time,
                        total_time=excluded.total_time, notes=excluded.notes
                ''', (sess['id'], instrument_id, sess.get('status'), sess['date'],
                      sess.get('start_time'), sess.get('end_time'), sess.get('total_time', 0),
                      sess.get('notes', ''), sess.get('created_at')))
                session_ids[sess['id']] = sess['id']

        if 'session_items' in data:
            for item in data['session_items']:
                category_id = category_ids.get(item.get('category_id'), item.get('category_id'))
                library_item_id = library_ids.get(item.get('library_item_id'), item.get('library_item_id'))
                session_id = session_ids.get(item['session_id'], item['session_id'])
                cursor.execute('''
                    INSERT INTO session_items (id, session_id, library_item_id, name, category_id, time_spent, started_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,
                        library_item_id=excluded.library_item_id, name=excluded.name,
                        category_id=excluded.category_id, time_spent=excluded.time_spent,
                        started_at=excluded.started_at
                ''', (item['id'], session_id, library_item_id, item['name'],
                      category_id, item.get('time_spent', 0), item.get('started_at')))

        # 7. Settings
        if 'settings' in data:
            for setting in data['settings']:
                cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                               (setting['key'], setting['value']))
        
        # 8. Table 'users' is no longer imported
        
        conn.commit()
        return jsonify({'status': 'success', 'message': 'Data imported successfully'})
    except Exception as e:
        app.logger.exception('Error importing data')
        conn.rollback()
        return jsonify({'error': str(e)}), 500
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
@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def serve_sw():
    return send_from_directory('static', 'sw.js')

if __name__ == '__main__':
    with app.app_context():
        init_db()
    
    # Use environment variables for production flexibility
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    use_reloader = os.getenv('FLASK_USE_RELOADER', str(debug_mode)).lower() in ('true', '1', 't')
    
    print(f"Starting FretLog server on 0.0.0.0:5000 (Debug: {debug_mode}, Reloader: {use_reloader})")
    app.run(debug=debug_mode, host='0.0.0.0', port=5000, use_reloader=use_reloader)
