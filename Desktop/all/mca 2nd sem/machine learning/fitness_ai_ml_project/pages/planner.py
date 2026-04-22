import streamlit as st
import pandas as pd
import os
import random
import matplotlib.pyplot as plt
from reportlab.platypus import SimpleDocTemplate, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from database import create_table, add_user, login_user

st.set_page_config(page_title="AI Fitness Pro", layout="wide")
create_table()

# -------- UI --------
st.markdown("""
<style>
.main {background:#0e1117; color:white;}
h1,h2,h3 {color:#00c6ff;}
</style>
""", unsafe_allow_html=True)

st.title("💪 AI Fitness Pro (Ultimate)")

# -------- WORKOUT --------
def generate_workout(goal, level):
    if goal == "Fat Loss":
        return [
            "Push + Cardio (Bench 4×10)",
            "Pull + Core",
            "Legs + HIIT",
            "Recovery",
            "Full Body",
            "Cardio",
            "Rest"
        ]
    elif goal == "Muscle Gain":
        return [
            "Chest + Triceps",
            "Back + Biceps",
            "Legs",
            "Rest",
            "Shoulders",
            "Arms",
            "Rest"
        ]
    else:
        return ["Full Body","Cardio","Yoga","Rest","Light","Walk","Rest"]

# -------- LOGIN --------
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
            st.error("Invalid")

elif choice=="Sign Up":
    u=st.text_input("Username")
    p=st.text_input("Password",type="password")

    if st.button("Create"):
        if add_user(u,p):
            st.success("Created")
        else:
            st.error("Exists")

# -------- MAIN --------
if st.session_state.get("logged"):

    st.subheader("🧠 Planner")

    col1,col2=st.columns(2)

    with col1:
        weight=st.number_input("Weight",40,120)
        target=st.number_input("Target Weight",40,120)
        height=st.number_input("Height",140,200)
        age=st.number_input("Age",15,60)

    with col2:
        goal=st.selectbox("Goal",["Fat Loss","Muscle Gain","Maintenance"])
        activity=st.selectbox("Activity",["Low","Moderate","High"])
        level=st.selectbox("Level",["Beginner","Intermediate","Advanced"])
        diet_type=st.selectbox("Diet",["Veg","Non-Veg"])

    file_name=st.text_input("File name")

    if st.button("Generate Plan"):

        # -------- CALC --------
        bmr=10*weight+6.25*height-5*age+5
        factor={"Low":1.2,"Moderate":1.4,"High":1.6}
        calories=int(bmr*factor[activity])
        protein=int(weight*1.8)

        # -------- PROGRESS --------
        progress=int(((weight-target)/weight)*100) if weight>target else 0
        st.write(f"Progress: {progress}%")

        # -------- DIET --------
        foods=["Paneer","Chicken","Eggs","Dal"]
        diet_plan={}
        for i in range(1,8):
            diet_plan[f"Day {i}"]={
                "Breakfast":random.choice(foods),
                "Lunch":random.choice(foods),
                "Dinner":random.choice(foods)
            }

        # -------- WORKOUT --------
        workout=generate_workout(goal,level)

        # -------- DISPLAY --------
        st.subheader("Calories")
        st.write(calories)

        st.subheader("Diet")
        for d,m in diet_plan.items():
            with st.expander(d):
                for t,v in m.items():
                    st.write(f"{t}: {v}")

        st.subheader("Workout")
        for i,w in enumerate(workout):
            st.write(f"Day {i+1}: {w}")

        # -------- REPLACE MEAL --------
        if st.button("Replace Meal"):
            st.success("Meal Updated 🔄")

        # -------- SAVE --------
        if file_name:
            os.makedirs("data",exist_ok=True)
            pd.DataFrame(diet_plan).to_csv(f"data/{file_name}.csv")
            st.success("Saved")

        # -------- PROGRESS SAVE --------
        pf=f"data/{st.session_state.user}_progress.csv"
        df=pd.DataFrame([{"Weight":weight,"Calories":calories}])
        if os.path.exists(pf):
            df.to_csv(pf,mode='a',header=False,index=False)
        else:
            df.to_csv(pf,index=False)

        # -------- PDF --------
        if st.button("Download PDF"):
            doc=SimpleDocTemplate("report.pdf")
            styles=getSampleStyleSheet()
            content=[Paragraph("Fitness Report",styles['Title'])]
            doc.build(content)
            with open("report.pdf","rb") as f:
                st.download_button("Download",f)

    # -------- DASHBOARD --------
    st.subheader("📊 Dashboard")

    file=f"data/{st.session_state.user}_progress.csv"

    if os.path.exists(file):
        df=pd.read_csv(file)
        st.dataframe(df)

        fig,ax=plt.subplots()
        ax.plot(df["Weight"])
        st.pyplot(fig)

    # -------- CHATBOT --------
    st.subheader("🤖 AI Coach")

    msg=st.text_input("Ask something")

    if msg:
        if "diet" in msg:
            st.write("Eat protein rich meals")
        elif "workout" in msg:
            st.write("Follow structured training")
        else:
            st.write("Ask fitness questions")