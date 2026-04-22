import streamlit as st
import pandas as pd
from sklearn.linear_model import LinearRegression
import numpy as np
import os
import random
import matplotlib.pyplot as plt
from reportlab.platypus import SimpleDocTemplate, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from database import create_table, add_user, login_user

st.set_page_config(page_title="AI Fitness Pro", layout="wide")
create_table()

st.title("💪 AI Fitness Pro (Final ML Version)")

# ---------------- ML PREDICTION ----------------
def predict_progress(df, target_weight):

    if len(df) < 3:
        return "Not enough data for prediction"

    X = np.arange(len(df)).reshape(-1,1)
    y = df["Weight"].values

    model = LinearRegression()
    model.fit(X, y)

    future_days = np.arange(len(df), len(df)+7).reshape(-1,1)
    predictions = model.predict(future_days)

    for i, w in enumerate(predictions):
        if w <= target_weight:
            return f"🎯 Goal may be reached in {i+1} days"

    return "⚠️ Goal not reachable with current trend"

# ---------------- SMART LOGIC ----------------
def smart_recommendation(df, goal):

    if len(df) < 2:
        return "Not enough data yet."

    last = df.iloc[-1]["Weight"]
    prev = df.iloc[-2]["Weight"]

    change = last - prev

    if goal == "Fat Loss":
        if change >= 0:
            return "⚠️ Reduce calories by 200"
        elif change < -1:
            return "⚠️ Increase calories slightly"
        else:
            return "✅ Good progress"

    elif goal == "Muscle Gain":
        if change <= 0:
            return "⚠️ Increase protein & calories"
        else:
            return "✅ Muscle gain on track"

    return "Maintain current plan"

# ---------------- WORKOUT ----------------
def generate_workout(goal):
    if goal == "Fat Loss":
        return ["Push+Cardio","Pull+Core","Legs+HIIT","Rest","Full Body","Cardio","Rest"]
    elif goal == "Muscle Gain":
        return ["Chest+Tri","Back+Bi","Legs","Rest","Shoulders","Arms","Rest"]
    else:
        return ["Full Body","Cardio","Yoga","Rest","Light","Walk","Rest"]

# ---------------- LOGIN ----------------
menu = ["Login","Sign Up"]
choice = st.selectbox("Menu",menu)

if choice=="Login":
    u = st.text_input("Username")
    p = st.text_input("Password",type="password")

    if st.button("Login"):
        if login_user(u,p):
            st.session_state.logged=True
            st.session_state.user=u
            st.success("Login Successful")
        else:
            st.error("Invalid credentials")

elif choice=="Sign Up":
    u=st.text_input("Username")
    p=st.text_input("Password",type="password")

    if st.button("Create"):
        if add_user(u,p):
            st.success("Account created")
        else:
            st.error("User exists")

# ---------------- MAIN ----------------
if st.session_state.get("logged"):

    st.subheader("🧠 Planner")

    col1,col2 = st.columns(2)

    with col1:
        weight = st.number_input("Weight",40,120)
        target = st.number_input("Target Weight",40,120)
        height = st.number_input("Height",140,200)
        age = st.number_input("Age",15,60)

    with col2:
        goal = st.selectbox("Goal",["Fat Loss","Muscle Gain","Maintenance"])
        activity = st.selectbox("Activity",["Low","Moderate","High"])
        diet_type = st.selectbox("Diet",["Veg","Non-Veg"])

    file_name = st.text_input("File name")

    # -------- GENERATE PLAN --------
    if st.button("Generate Plan"):

        # CALCULATIONS
        bmr = 10*weight + 6.25*height - 5*age + 5
        factor = {"Low":1.2,"Moderate":1.4,"High":1.6}
        tdee = bmr * factor[activity]

        if goal == "Fat Loss":
            calories = int(tdee - 400)
        elif goal == "Muscle Gain":
            calories = int(tdee + 300)
        else:
            calories = int(tdee)

        protein = int(weight * 1.8)

        # PROGRESS
        progress = int(((weight-target)/weight)*100) if weight>target else 0
        st.success(f"Progress: {progress}%")

        # DIET
        veg = ["Paneer","Tofu","Dal"]
        nonveg = ["Chicken","Eggs","Fish"]
        foods = veg if diet_type=="Veg" else nonveg

        carbs = ["Rice","Roti","Oats"]
        fruits = ["Apple","Banana","Orange"]

        diet_plan = {}

        for i in range(1,8):
            diet_plan[f"Day {i}"] = {
                "Breakfast": random.choice(fruits),
                "Lunch": f"{random.choice(carbs)} + {random.choice(foods)}",
                "Snack": "Nuts",
                "Dinner": random.choice(foods)
            }

        st.session_state.diet_plan = diet_plan

        # WORKOUT
        workout = generate_workout(goal)

        # DISPLAY
        st.subheader("Calories")
        st.write(calories)

        st.subheader("Diet Plan")
        for d,m in diet_plan.items():
            with st.expander(d):
                for t,v in m.items():
                    st.write(f"{t}: {v}")

        st.subheader("Workout")
        for i,w in enumerate(workout):
            st.write(f"Day {i+1}: {w}")

        # SAVE
        if file_name:
            os.makedirs("data",exist_ok=True)
            pd.DataFrame(diet_plan).to_csv(f"data/{file_name}.csv")
            st.success("Saved")

        # SAVE PROGRESS
        pf = f"data/{st.session_state.user}_progress.csv"
        df = pd.DataFrame([{"Weight":weight,"Calories":calories}])

        if os.path.exists(pf):
            df.to_csv(pf,mode='a',header=False,index=False)
        else:
            df.to_csv(pf,index=False)

        # PDF
        if st.button("Download PDF"):
            doc = SimpleDocTemplate("report.pdf")
            styles = getSampleStyleSheet()
            content = [Paragraph(f"Calories: {calories}", styles['Normal'])]
            doc.build(content)

            with open("report.pdf","rb") as f:
                st.download_button("Download",f)

    # -------- MEAL REPLACE --------
    if "diet_plan" in st.session_state:
        if st.button("🔄 Replace Dinner"):
            foods = ["Paneer","Chicken","Eggs","Dal"]
            for d in st.session_state.diet_plan:
                st.session_state.diet_plan[d]["Dinner"] = random.choice(foods)
            st.success("Dinner Updated")

    # -------- DASHBOARD --------
    st.subheader("📊 Dashboard")

    file = f"data/{st.session_state.user}_progress.csv"

    if os.path.exists(file):
        df = pd.read_csv(file)
        st.dataframe(df)

        # BASIC GRAPH
        fig, ax = plt.subplots()
        ax.plot(df["Weight"], marker='o')
        st.pyplot(fig)

        # RECOMMENDATION
        st.subheader("🧠 Recommendation")
        st.success(smart_recommendation(df, goal))

        # ML PREDICTION TEXT
        st.subheader("📈 ML Prediction")
        st.info(predict_progress(df, target))

        # -------- FINAL ML GRAPH WITH GOAL --------
        if len(df) >= 3:

            X = np.arange(len(df))
            y = df["Weight"]

            model = LinearRegression()
            model.fit(X.reshape(-1,1), y)

            future = np.arange(len(df)+15)
            pred = model.predict(future.reshape(-1,1))

            goal_day = None
            for i, w in enumerate(pred):
                if w <= target:
                    goal_day = i
                    break

            fig2, ax2 = plt.subplots()

            ax2.plot(X, y, label="Actual", marker='o')
            ax2.plot(future, pred, linestyle='dashed', label="Predicted")

            if goal_day is not None:
                ax2.axvline(x=goal_day, linestyle='--')
                ax2.text(goal_day, target,
                         f" Goal in {goal_day} days",
                         fontsize=10)

            ax2.set_title("📈 Weight Prediction with Goal Timeline")
            ax2.legend()

            st.pyplot(fig2)

    else:
        st.info("No data yet")

    # -------- CHATBOT --------
    st.subheader("🤖 AI Coach")

    msg = st.text_input("Ask")

    if msg:
        if "diet" in msg:
            st.write("Eat protein rich meals")
        elif "workout" in msg:
            st.write("Train 4-6 days weekly")
        else:
            st.write("Ask fitness questions")