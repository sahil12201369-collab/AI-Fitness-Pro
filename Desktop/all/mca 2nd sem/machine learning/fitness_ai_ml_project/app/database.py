import sqlite3
import hashlib

DB_NAME = "users.db"

# ---------------- CONNECTION ----------------
def connect():
    return sqlite3.connect(DB_NAME)

# ---------------- CREATE TABLE ----------------
def create_table():
    conn = connect()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS users(
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            age INTEGER,
            height REAL,
            weight REAL
        )
    """)

    conn.commit()
    conn.close()

# ---------------- HASH PASSWORD ----------------
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# ---------------- ADD USER ----------------
def add_user(username, password, age=None, height=None, weight=None):
    conn = connect()
    c = conn.cursor()

    try:
        c.execute("""
            INSERT INTO users(username, password, age, height, weight)
            VALUES (?, ?, ?, ?, ?)
        """, (username, hash_password(password), age, height, weight))

        conn.commit()
        return True

    except sqlite3.IntegrityError:
        return False

    finally:
        conn.close()

# ---------------- LOGIN ----------------
def login_user(username, password):
    conn = connect()
    c = conn.cursor()

    c.execute("""
        SELECT * FROM users 
        WHERE username=? AND password=?
    """, (username, hash_password(password)))

    user = c.fetchone()
    conn.close()

    return user

# ---------------- GET USER PROFILE ----------------
def get_user(username):
    conn = connect()
    c = conn.cursor()

    c.execute("SELECT * FROM users WHERE username=?", (username,))
    user = c.fetchone()

    conn.close()
    return user

# ---------------- UPDATE PROFILE ----------------
def update_user(username, age, height, weight):
    conn = connect()
    c = conn.cursor()

    c.execute("""
        UPDATE users
        SET age=?, height=?, weight=?
        WHERE username=?
    """, (age, height, weight, username))

    conn.commit()
    conn.close()