import pandas as pd
import random
import os

data = []

goals = ['Fat Loss', 'Muscle Gain', 'Maintenance', 'Endurance']
levels = ['Beginner', 'Intermediate', 'Advanced']
injuries = ['None', 'Knee', 'Back', 'Shoulder']
diet_prefs = ['Vegetarian', 'Non-Vegetarian', 'Vegan']

def get_workout(goal, level, injury):
    if injury != 'None':
        return 'Mobility & Rehab'
    if goal == 'Fat Loss':
        return 'HIIT Fat Loss'
    elif goal == 'Muscle Gain':
        if level == 'Beginner':
            return 'Full Body Beginner'
        elif level == 'Intermediate':
            return 'Push Pull Legs'
        else:
            return 'Bro Split'
    elif goal == 'Endurance':
        return 'Cardio Endurance'
    return 'Strength Training'

def get_diet(goal):
    if goal == 'Fat Loss':
        return 'Low Carb High Protein'
    elif goal == 'Muscle Gain':
        return 'High Protein High Carb'
    elif goal == 'Endurance':
        return 'High Carb Balanced'
    return 'Balanced Diet'

def get_timeline(weight, target):
    diff = abs(weight - target)
    return round(diff * 0.5 + random.uniform(2, 6), 1)

for _ in range(1000):
    age = random.randint(18, 45)
    gender = random.choice(['Male', 'Female'])
    height = random.randint(150, 190)
    weight = random.randint(45, 110)

    bmi = round(weight / ((height / 100) ** 2), 2)
    body_fat = round(random.uniform(10, 35), 1)

    goal = random.choice(goals)
    level = random.choice(levels)
    days = random.randint(2, 6)
    injury = random.choice(injuries)
    diet_pref = random.choice(diet_prefs)

    sleep = round(random.uniform(5, 9), 1)
    water = round(random.uniform(1.5, 4.5), 1)

    target_weight = random.randint(45, 100)

    workout = get_workout(goal, level, injury)
    diet = get_diet(goal)
    timeline = get_timeline(weight, target_weight)

    data.append([
        age, gender, height, weight, bmi, body_fat,
        goal, level, days, injury, diet_pref,
        sleep, water, target_weight,
        workout, diet, timeline
    ])

df = pd.DataFrame(data, columns=[
    'Age', 'Gender', 'Height_cm', 'Weight_kg', 'BMI',
    'Body_Fat_%', 'Fitness_Goal', 'Fitness_Level',
    'Workout_Days', 'Injury_Status', 'Dietary_Preference',
    'Sleep_Hours', 'Water_Intake_L', 'Target_Weight',
    'Recommended_Workout', 'Recommended_Diet',
    'Goal_Timeline_Weeks'
])

# IMPORTANT PART
os.makedirs('dataset', exist_ok=True)
df.to_csv('dataset/fitness_dataset.csv', index=False)

print("✅ Dataset created successfully!")
print(df.head())