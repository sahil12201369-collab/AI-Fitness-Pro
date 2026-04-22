import streamlit as st
import joblib
import pandas as pd
import os
import matplotlib.pyplot as plt
from database import create_table, add_user, login_user

st.set_page_config(page_title="AI Fitness Pro", layout="wide")

# ---------- UI STYLE ----------
st.markdown("""
<style>
.main { background-color: #0e1117; color: white; }
.stButton>button {
    background: linear-gradient(90deg,#00c6ff,#0072ff);
    color:white; border-radius:10px;
}
</style>
""", unsafe_allow_html=True)

create_table()

st.title("💪 AI Fitness Pro System")

menu = ["Login", "Sign Up"]
choice = st.selectbox("Menu", menu)

# ---------- LOGIN ----------
if choice == "Login":
    username = st.text_input("Username")
    password = st.text_input("Password", type="password")

    if st.button("Login"):
        user = login_user(username, password)

        if user:
            st.session_state["logged_in"] = True
            st.session_state["user"] = username
            st.session_state["age"] = user[2]
            st.session_state["height"] = user[3]
            st.session_state["goal"] = user[4]
            st.success("Login Successful ✅")
        else:
            st.error("Invalid credentials ❌")

# ---------- SIGNUP ----------
elif choice == "Sign Up":
    new_user = st.text_input("Username")
    new_pass = st.text_input("Password", type="password")
    age = st.number_input("Age", 15, 60)
    height = st.number_input("Height (cm)", 140, 200)
    goal = st.selectbox("Goal", ["Fat Loss", "Muscle Gain"])

    if st.button("Create Account"):
        if add_user(new_user, new_pass, age, height, goal):
            st.success("Account Created ✅")
        else:
            st.error("User exists ❌")

# ---------- NAV ----------
if st.session_state.get("logged_in"):

    col1, col2, col3 = st.columns(3)

    if col1.button("🏠 Dashboard"):
        st.session_state["page"] = "home"
        st.rerun()

    if col2.button("🧠 Planner"):
        st.session_state["page"] = "planner"
        st.rerun()

    if col3.button("📊 Progress"):
        st.session_state["page"] = "progress"
        st.rerun()

# ---------- ROUTING ----------
if "page" in st.session_state:

    # DASHBOARD
    if st.session_state["page"] == "home":
        st.subheader("📊 Dashboard")

        st.success(f"Welcome {st.session_state['user']} 👋")

    # PLANNER (ML + UI)
    elif st.session_state["page"] == "planner":

        st.subheader("🧠 Smart Planner")

        goal = st.selectbox("Goal", ["Fat Loss","Muscle Gain"])
        activity = st.selectbox("Activity", ["Low","Moderate","High"])
        diet_type = st.selectbox("Diet", ["Vegetarian","Non-Vegetarian","Vegan"])
        weight = st.number_input("Weight", 40, 120)

        age = st.session_state["age"]
        height = st.session_state["height"]

        # LOAD MODEL
        model = joblib.load("models/calorie_model.pkl")

        goal_map = {"Fat Loss":0,"Muscle Gain":1}
        activity_map = {"Low":1,"Moderate":2,"High":3}

        pred_cal = model.predict([[age,weight,height,goal_map[goal],activity_map[activity]]])[0]

        # BMI
        bmi = weight / ((height/100)**2)

        # ---------- TABS ----------
        tab1, tab2, tab3 = st.tabs(["📊 Analysis","🥗 Diet","🏋️ Workout"])

        # ANALYSIS
        with tab1:
            col1, col2 = st.columns(2)
            col1.metric("Calories", int(pred_cal))
            col2.metric("BMI", round(bmi,2))

        # DIET
        with tab2:
            st.subheader("Diet Plan")

            meals = {
                "Breakfast":"Oats + Milk",
                "Lunch":"Rice + Protein",
                "Dinner":"Veg + Protein",
                "Snacks":"Nuts"
            }

            for k,v in meals.items():
                st.info(f"{k}: {v}")

        # WORKOUT
        with tab3:
            workout = ["Push","Pull","Legs","Rest","HIIT","Cardio"]

            for i,w in enumerate(workout):
                st.write(f"Day {i+1}: {w}")

        # SAVE
        if st.button("Save Progress"):
            os.makedirs("data", exist_ok=True)
            file = f"data/{st.session_state['user']}.csv"

            df = pd.DataFrame([{"Weight":weight}])

            if os.path.exists(file):
                df.to_csv(file, mode='a', header=False, index=False)
            else:
                df.to_csv(file, index=False)

            st.success("Saved ✅")

    # PROGRESS
    elif st.session_state["page"] == "progress":

        file = f"data/{st.session_state['user']}.csv"

        if os.path.exists(file):
            df = pd.read_csv(file)

            st.dataframe(df)

            fig, ax = plt.subplots()
            ax.plot(df["Weight"], marker='o')
            st.pyplot(fig)
        else:
            st.write("No data yet")