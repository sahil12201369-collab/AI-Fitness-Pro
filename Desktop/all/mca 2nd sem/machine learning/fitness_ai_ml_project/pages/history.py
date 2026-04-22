import streamlit as st
import pandas as pd
import os

if "logged_in" not in st.session_state:
    st.warning("Login first")
    st.stop()

st.title("📁 History")

file = f"data/{st.session_state['user']}.csv"

if os.path.exists(file):
    df = pd.read_csv(file)
    st.dataframe(df)
else:
    st.write("No history yet")