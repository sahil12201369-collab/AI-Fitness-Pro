import streamlit as st

if "logged_in" not in st.session_state:
    st.warning("Please login first")
    st.stop()

st.title("🏠 Home Page")

st.success(f"Welcome {st.session_state['user']} 👋")

if st.button("Logout"):
    st.session_state.clear()
    st.rerun()