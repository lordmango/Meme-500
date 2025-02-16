import sys
import os
import pandas as pd
import numpy as np
import json
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

# Paths for pre-trained models and scaler
model_06_path = "model_06.joblib"
model_1_path = "model_1.joblib"
scaler_path = "scaler.joblib"

# Define features (needed for both training and prediction)
features = ["Market Cap", "All Sold?", "Buy Candle", "P1 Candle", "P2 Candle",
            "Buy Volume", "P1 Volume", "P2 Volume",
            "P2 to P1 Candle Ratio", "P1 to Buy Candle Ratio", "P2 to Buy Candle Ratio",
            "P2 to P1 Volume Ratio", "P1 to Buy Volume Ratio", "P2 to Buy Volume Ratio"]

if os.path.exists(model_06_path) and os.path.exists(model_1_path) and os.path.exists(scaler_path):
    model_06 = joblib.load(model_06_path)
    model_1 = joblib.load(model_1_path)
    scaler = joblib.load(scaler_path)
else:
    # Load dataset from JSON file
    file_path = "/Users/lord_mango/Meme-500/data/initialData.json"  # Update with your file path
    with open(file_path, "r") as f:
        data = json.load(f)

    # Convert to Pandas DataFrame
    df = pd.DataFrame(data)

    # Create two target labels
    df["Target_06"] = (df["3 Hr High %"] >= 0.6).astype(int)
    df["Target_1"] = (df["3 Hr High %"] >= 1).astype(int)

    # Filter dataset to only include Market Cap > 100,000
    df = df[df["Market Cap"] > 100000]

    # Create ratio features (handling division by zero)
    df["P2 to P1 Candle Ratio"] = np.where(df["P1 Candle"] == 0, 0, df["P2 Candle"] / df["P1 Candle"])
    df["P1 to Buy Candle Ratio"] = np.where(df["Buy Candle"] == 0, 0, df["P1 Candle"] / df["Buy Candle"])
    df["P2 to Buy Candle Ratio"] = np.where(df["Buy Candle"] == 0, 0, df["P2 Candle"] / df["Buy Candle"])

    df["P2 to P1 Volume Ratio"] = np.where(df["P1 Volume"] == 0, 0, df["P2 Volume"] / df["P1 Volume"])
    df["P1 to Buy Volume Ratio"] = np.where(df["Buy Volume"] == 0, 0, df["P1 Volume"] / df["Buy Volume"])
    df["P2 to Buy Volume Ratio"] = np.where(df["Buy Volume"] == 0, 0, df["P2 Volume"] / df["Buy Volume"])

    X = df[features]
    y_06 = df["Target_06"]
    y_1 = df["Target_1"]

    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train logistic regression models
    model_06 = LogisticRegression()
    model_1 = LogisticRegression()

    model_06.fit(X_scaled, y_06)
    model_1.fit(X_scaled, y_1)

    # Save models and scaler
    joblib.dump(model_06, model_06_path)
    joblib.dump(model_1, model_1_path)
    joblib.dump(scaler, scaler_path)

# Check if command-line arguments are provided
if len(sys.argv) > 1:
    # Read input from command-line arguments (expecting 8 base inputs)
    args = list(map(float, sys.argv[1:9]))
    market_cap, all_sold, buy_candle, p1_candle, p2_candle, buy_volume, p1_volume, p2_volume = args

    # Compute additional ratio features
    p2_to_p1_candle_ratio = 0 if p1_candle == 0 else p2_candle / p1_candle
    p1_to_buy_candle_ratio = 0 if buy_candle == 0 else p1_candle / buy_candle
    p2_to_buy_candle_ratio = 0 if buy_candle == 0 else p2_candle / buy_candle
    p2_to_p1_volume_ratio = 0 if p1_volume == 0 else p2_volume / p1_volume
    p1_to_buy_volume_ratio = 0 if buy_volume == 0 else p1_volume / buy_volume
    p2_to_buy_volume_ratio = 0 if buy_volume == 0 else p2_volume / buy_volume

    # Create new transaction data as a DataFrame
    new_data = pd.DataFrame([[
        market_cap, all_sold, buy_candle, p1_candle, p2_candle,
        buy_volume, p1_volume, p2_volume,
        p2_to_p1_candle_ratio, p1_to_buy_candle_ratio, p2_to_buy_candle_ratio,
        p2_to_p1_volume_ratio, p1_to_buy_volume_ratio, p2_to_buy_volume_ratio
    ]], columns=features)

    # Standardize the new data using the same scaler
    new_data_scaled = scaler.transform(new_data)

    # Predict probabilities
    predicted_prob_06 = model_06.predict_proba(new_data_scaled)[:, 1][0]
    predicted_prob_1 = model_1.predict_proba(new_data_scaled)[:, 1][0]

    # Print both probabilities (formatted to 4 decimal places)
    print(f"{predicted_prob_06:.4f} {predicted_prob_1:.4f}")

else:
    print("\n🚀 Model trained! Now enter a new transaction to predict its probability.\n")
